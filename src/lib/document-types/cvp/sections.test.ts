import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { getDocumentType } from "@/lib/document-types";
import { CVP_DRAFTING_GUIDANCE } from "./drafting-guidance";
import {
  ensureCvpEquipmentFieldContent,
  insertBlankCvpEquipmentItem,
  normalizeCvpEquipmentSamplingContent,
} from "./equipment-sampling";
import {
  CVP_BATCH_EXECUTION_HEADERS,
  CVP_DEVIATIONS_SEED,
  CVP_EQUIPMENT_H3_OUTLINE,
  CVP_EQUIPMENT_H4_OUTLINE,
  CVP_EVALUATION_SEEDS,
  CVP_FORM_NO,
  CVP_MACO_EQUIPMENT_HEADERS,
  CVP_METHOD_VALIDATION_INTRO_SEED,
  CVP_NITROSAMINE_HEADERS,
  CVP_NITROSAMINE_INTRO_SEED,
  CVP_PGI_INTRO_SEED,
  CVP_PREVIOUS_NITROSAMINE_HEADERS,
  CVP_PREVIOUS_RESIDUE_RESULTS_HEADERS,
  CVP_PROCESS_LINE_INTRO_SEED,
  CVP_RESIDUE_RESULTS_HEADERS,
  CVP_REVALIDATION_SEED,
  CVP_SECTION_KEYS,
  CVP_TABLE_SECTION_KEYS,
  CVP_TESTING_PROCEDURE_INTRO_SEED,
  EMPTY_CVP_CONTENT,
  alignCvpMacoEquipmentHeaders,
  cvpEquipmentSamplingSeed,
  cvpMetadataFrom,
  cvpPrintedDocumentTitle,
  isCvpTableSectionKey,
  upgradeCvpEquipmentSamplingNarrative,
} from "./sections";
import { upgradeCvpValidationDoc } from "./cycle-upgrade";
import { summarizeTablesInDoc } from "@/lib/suggestions/table-operation";

describe("cleaning verification protocol sections", () => {
  it("registers thirty F08 sections with a narrative or table field", () => {
    const def = getDocumentType("cleaning_verification_protocol");
    expect(def.key).toBe("cleaning_verification_protocol");
    expect(def.documentNoLabel).toBe("Protocol No.");
    expect(def.wordImport).toEqual({ kind: "cleaning_verification_protocol" });
    expect(def.sections).toHaveLength(30);
    expect(def.sections.map((s) => s.key)).toEqual([...CVP_SECTION_KEYS]);
    expect(CVP_FORM_NO).toBe("QAD-SOP-PS-003-F08-00");
    for (const key of CVP_SECTION_KEYS) {
      const field =
        key === "cvp_equipment_sampling"
          ? "items.[]"
          : isCvpTableSectionKey(key)
            ? "table"
            : "narrative";
      if (key === "cvp_equipment_sampling") {
        expect(EMPTY_CVP_CONTENT[key]).toHaveProperty("items");
      } else {
        expect(EMPTY_CVP_CONTENT[key]).toHaveProperty(
          isCvpTableSectionKey(key) ? "table" : "narrative"
        );
      }
      expect(def.suggestTargetFieldPatterns[key]).toEqual([field]);
      expect(def.richFieldPaths[key]).toEqual([field]);
    }
    expect(CVP_TABLE_SECTION_KEYS).toContain("cvp_approvals");
    expect(isCvpTableSectionKey("cvp_objective")).toBe(false);
    expect(def.editorProfile).toBe("report_headings");
  });

  it("seeds MACO as three separate tables, not one grid", () => {
    const seed = EMPTY_CVP_CONTENT.cvp_maco;
    expect(seed).toHaveProperty("narrative");
    const tables = summarizeTablesInDoc(
      "narrative" in seed ? seed.narrative : { type: "doc", content: [] }
    );
    expect(tables).toHaveLength(3);
    expect(tables[0]?.headers).toEqual([...CVP_MACO_EQUIPMENT_HEADERS]);
    expect(tables[0]?.headers).toContain("Is used for Stage-4?");
    expect(tables[0]?.headers).toContain(
      "Equipment used previous / subsequent to this product"
    );
    expect(tables[0]?.headers).toContain(
      "Minimum batch size for this equipment manufactured"
    );
    expect(tables[1]?.headers[0]).toBe("Attribute");
    expect(tables[2]?.headers[0]).toBe("Attribute");
    expect(tables[1]?.cells.some((cell) => cell.text === "PDE")).toBe(true);
    expect(tables[2]?.cells.some((cell) => cell.text === "MAXCONC")).toBe(true);
  });

  it("rewrites the previous MACO equipment header labels", () => {
    const seed = EMPTY_CVP_CONTENT.cvp_maco;
    const narrative =
      "narrative" in seed ? structuredClone(seed.narrative) : { type: "doc" as const };
    const header = narrative.content?.find((node) => node.type === "table")
      ?.content?.[0];
    const labels = [
      "S. No.",
      "Name of the Equipment",
      "Equipment No.",
      "Capacity",
      "MOC",
      "Used for this stage?",
      "Used previous / subsequent to this product?",
      "Minimum batch size",
      "Product contact / Non-product contact",
    ];
    header?.content?.forEach((cell, index) => {
      const text = cell.content?.[0]?.content?.[0];
      if (text?.type === "text") text.text = labels[index] ?? text.text;
    });
    const aligned = alignCvpMacoEquipmentHeaders(narrative);
    const headers = summarizeTablesInDoc(aligned)[0]?.headers;
    expect(headers).toEqual([...CVP_MACO_EQUIPMENT_HEADERS]);
    const merged = getDocumentType("cleaning_verification_protocol").mergeSection(
      "cvp_maco",
      { narrative }
    ) as { narrative: JSONContent };
    expect(summarizeTablesInDoc(merged.narrative)[0]?.headers).toEqual([
      ...CVP_MACO_EQUIPMENT_HEADERS,
    ]);
  });

  it("strips a leftover Table 15 caption on the unused 15.1 identity shell at merge", () => {
    const seed = EMPTY_CVP_CONTENT.cvp_equipment_sampling;
    const item =
      "items" in seed
        ? structuredClone(seed.items[0])
        : { type: "doc" as const, content: [] };
    const tableIndex =
      item.content?.findIndex((node) => node.type === "table") ?? -1;
    item.content?.splice(tableIndex, 0, {
      type: "paragraph",
      content: [{ type: "text", text: "Table 15. Cvp Equipment Sampling" }],
    });
    const def = getDocumentType("cleaning_verification_protocol");
    const merged = def.mergeSection("cvp_equipment_sampling", {
      items: [item],
    }) as { items: Array<{ content?: Array<{ type?: string }> }> };
    const text = JSON.stringify(merged);
    expect(text).not.toMatch(/Table 15/);
    expect(text).not.toMatch(/Cvp Equipment Sampling/);
  });

  it("seeds shared 15.N boilerplate without swab/visual tables", () => {
    const seed = EMPTY_CVP_CONTENT.cvp_equipment_sampling;
    expect(seed).toHaveProperty("items");
    const nodes =
      "items" in seed ? (seed.items[0]?.content ?? []) : [];
    const headings = nodes
      .filter((node) => node.type === "heading")
      .map((node) => ({
        level: node.attrs?.level,
        text: node.content?.[0]?.text,
      }));
    const tables = nodes.filter((node) => node.type === "table");
    const text = JSON.stringify(nodes);
    expect(headings).toEqual([
      { level: 2, text: "15.1 Equipment name (Equipment No.)" },
      { level: 3, text: "15.1.1 Equipment details" },
      { level: 3, text: "15.1.2 Supporting Documents and References" },
      { level: 3, text: "15.1.5 Cleaning validation results summary" },
      {
        level: 3,
        text: "15.1.7 Swab & Rinse samples analysis results summary",
      },
      {
        level: 3,
        text: "15.1.8 Rinse samples analysis results summary (Extraneous matter)",
      },
    ]);
    expect(tables).toHaveLength(4);
    expect(JSON.stringify(tables[0])).toContain("Capacity");
    expect(JSON.stringify(tables[0])).not.toContain("Shell height");
    expect(text).toContain("[Plant]");
    expect(text).toContain("Black and fiber particles should be absent");
    expect(headings.map((h) => h.text).join(" ")).not.toContain("15.1.3.1");
    expect(headings.map((h) => h.text).join(" ")).not.toContain("15.1.6");
    expect(CVP_EQUIPMENT_H3_OUTLINE).toHaveLength(8);
    expect(CVP_EQUIPMENT_H4_OUTLINE[0]?.title).toBe("Worst-case locations");
  });

  it("upgrades a lumped identity table into the 15.N.M outline", () => {
    const lumped = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Insert one heading plus tables per product-contact equipment from Scope (Name (Equipment No.)).",
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }],
                },
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Details" }] }],
                },
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Reference" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Capacity" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "10000 L" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const upgraded = upgradeCvpEquipmentSamplingNarrative(lumped);
    const text = JSON.stringify(upgraded);
    expect(text).toContain("15.1.1 Equipment details");
    expect(text).toContain("10000 L");
    expect(text).not.toMatch(/Insert one heading plus tables/i);
    expect(upgraded.content?.some((node) => node.type === "heading")).toBe(true);
  });

  it("does not put the 15.1 seed back after the engineer clears the box", () => {
    const def = getDocumentType("cleaning_verification_protocol");
    const merged = def.mergeSection("cvp_equipment_sampling", {
      items: [{ type: "doc", content: [{ type: "paragraph" }] }],
    }) as { items: Array<{ content?: Array<{ type?: string }> }> };
    const text = JSON.stringify(merged);
    expect(text).not.toContain("Equipment name (Equipment No.)");
    expect(text).not.toContain("Duplicate this box");
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.content?.some((node) => node.type === "table")).toBe(
      false
    );
  });

  it("does not graft Duplicate-this-box onto filled tables that lost their headings", () => {
    const seed = cvpEquipmentSamplingSeed(1);
    const identity = seed.content?.find((node) => node.type === "table");
    const filled: JSONContent = JSON.parse(JSON.stringify(identity));
    const detailsCell = filled.content?.[1]?.content?.[1];
    if (detailsCell?.content?.[0]) {
      detailsCell.content[0] = {
        type: "paragraph",
        content: [{ type: "text", text: "10000 L" }],
      };
    }
    const def = getDocumentType("cleaning_verification_protocol");
    const merged = def.mergeSection("cvp_equipment_sampling", {
      items: [{ type: "doc", content: [filled] }],
    }) as { items: JSONContent[] };
    const text = JSON.stringify(merged);
    expect(text).toContain("10k L");
    expect(text).not.toContain("10000 L");
    expect(text).not.toContain("Duplicate this box");
    expect(text).not.toContain("Equipment name (Equipment No.)");
  });

  it("collapses stacked 15.1 outlines and promotes a GLR title paragraph to the H2", () => {
    const seed = cvpEquipmentSamplingSeed(1);
    const identity = seed.content?.find((node) => node.type === "table");
    const filledIdentity: JSONContent = JSON.parse(JSON.stringify(identity));
    const detailsCell = filledIdentity.content?.[1]?.content?.[1];
    if (detailsCell?.content?.[0]) {
      detailsCell.content[0] = {
        type: "paragraph",
        content: [{ type: "text", text: "10000 L [1]" }],
      };
    }
    const stacked: JSONContent = {
      type: "doc",
      content: [
        ...(seed.content ?? []).map((node) =>
          node.type === "table" &&
          JSON.stringify(node).includes('"Parameter"')
            ? filledIdentity
            : node
        ),
        ...((seed.content ?? []) as JSONContent[]),
        {
          type: "paragraph",
          content: [{ type: "text", text: "15.1 Glass Lined Reactor (GLR-1302)" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The subject equipment GLR-1302 is located in Production Block-2.",
            },
          ],
        },
        ...((seed.content ?? []) as JSONContent[]),
        {
          type: "paragraph",
          content: [{ type: "text", text: "Inference:", marks: [{ type: "bold" }] }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "It shall be written in the cleaning validation report.",
            },
          ],
        },
      ],
    };
    const { items } = normalizeCvpEquipmentSamplingContent({ items: [stacked] });
    const text = JSON.stringify(items[0]);
    const h2s = (items[0]?.content ?? []).filter(
      (node) => node.type === "heading" && Number(node.attrs?.level) === 2
    );
    expect(h2s).toHaveLength(1);
    expect(JSON.stringify(h2s[0])).toContain("Glass Lined Reactor (GLR-1302)");
    expect(text).toContain("10k L [1]");
    expect(text).not.toContain("Duplicate this box");
    expect((text.match(/15\.1\.1 Equipment details/g) ?? []).length).toBe(1);
    expect((text.match(/It shall be written in the cleaning validation report\./g) ?? []).length).toBe(2);
  });

  it("does not retitle sibling 15.N boxes when applying one equipment item", () => {
    const first = cvpEquipmentSamplingSeed(1);
    const second = cvpEquipmentSamplingSeed(1);
    const next = ensureCvpEquipmentFieldContent(
      { items: [first, second] },
      "items.0"
    );
    const items = next.items as JSONContent[];
    const title = (doc: JSONContent | undefined) =>
      (doc?.content ?? [])
        .filter((node) => node.type === "heading" && Number(node.attrs?.level) === 2)
        .map((node) => (node.content ?? []).map((t) => t.text ?? "").join(""))
        .join("");
    expect(title(items[1])).toContain("15.1 Equipment name");
    expect(title(items[1])).not.toContain("15.2");
  });

  it("adds a blank 15.2 template that does not copy filled tables from 15.1", () => {
    const seed = cvpEquipmentSamplingSeed(1);
    const filled: JSONContent = JSON.parse(JSON.stringify(seed));
    const identity = filled.content?.find((node) => node.type === "table");
    const detailsCell = identity?.content?.[1]?.content?.[1];
    if (detailsCell?.content?.[0]) {
      detailsCell.content[0] = {
        type: "paragraph",
        content: [{ type: "text", text: "10000 L" }],
      };
    }
    const next = insertBlankCvpEquipmentItem([filled], 0);
    expect(next).toHaveLength(2);
    expect(JSON.stringify(next[0])).toContain("10000 L");
    expect(JSON.stringify(next[1])).not.toContain("10000 L");
    const newH2 = (next[1]?.content ?? []).find(
      (node) => node.type === "heading" && Number(node.attrs?.level) === 2
    );
    expect(JSON.stringify(newH2)).toContain("15.2 Equipment name (Equipment No.)");
  });

  it("restores flattened 15.N outline paragraphs as headings and renumbers by box", () => {
    const flatten = (doc: JSONContent): JSONContent => ({
      ...doc,
      content: (doc.content ?? []).map((node) =>
        node.type === "heading"
          ? {
              type: "paragraph",
              content: (node.content ?? []).map((t) => ({
                ...t,
                marks: [{ type: "bold" }],
              })),
            }
          : node
      ),
    });
    const { items } = normalizeCvpEquipmentSamplingContent({
      items: [flatten(cvpEquipmentSamplingSeed(2)), flatten(cvpEquipmentSamplingSeed(2))],
    });
    const headings = items.map((item) =>
      (item.content ?? [])
        .filter((node) => node.type === "heading")
        .map((node) => [
          Number(node.attrs?.level),
          (node.content ?? []).map((t) => t.text ?? "").join(""),
        ])
    );
    expect(headings[0]?.[0]).toEqual([2, "15.1 Equipment name (Equipment No.)"]);
    expect(headings[0]).toContainEqual([3, "15.1.1 Equipment details"]);
    expect(headings[0]).toContainEqual([
      3,
      "15.1.2 Supporting Documents and References",
    ]);
    expect(headings[1]?.[0]).toEqual([2, "15.2 Equipment name (Equipment No.)"]);
    expect(headings[1]).toContainEqual([3, "15.2.1 Equipment details"]);
    expect(headings[1]).toContainEqual([
      3,
      "15.2.2 Supporting Documents and References",
    ]);
  });

  it("tells Agent the whole form is a protocol with explicit leave-blank execution fields", () => {
    const def = getDocumentType("cleaning_verification_protocol");
    expect(def.prompts.promptVersion).toBe("3xper-cvp-f08-v3");
    expect(def.prompts.base).toContain(
      "This is a protocol, not an executed cleaning validation report"
    );
    expect(def.prompts.base).toContain("Blank execution cells");
    expect(def.chat.persona).toContain(
      "not the cleaning validation **report**"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "PROTOCOL vs REPORT — fill the plan; leave execution blank"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "1.0 Name, Designation, Sign & date"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "Result fields are intentionally left blank for recording during report finalization."
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "Equipment sampling (15.1, 15.2, …) is a **protocol**, not a report"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "Subsections are **not identical for every item**"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain("No-swab item");
    expect(CVP_DRAFTING_GUIDANCE).toContain("**Batch 1 / Batch 2 / Batch 3 stay empty.**");
    expect(CVP_DRAFTING_GUIDANCE).toContain("**last column only**");
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "It shall be written in the cleaning validation report."
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "The three Batch columns stay blank in the protocol"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "already has the **shared** 15.N boilerplate"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain("**Do not draft_field**");
    expect(CVP_DRAFTING_GUIDANCE).toContain("replaceFilledField: true");
    expect(CVP_DRAFTING_GUIDANCE).toContain("**ML tank / receiver**");
    expect(CVP_DRAFTING_GUIDANCE).toContain("insert suggestions for 15.N.1");
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "the server strips those tables and still lands the paragraph"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain("create_table: omit title");
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "Do not replay these ISM4 source mismatches"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "skip 15.N.3.2 when identity has no shell"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "Upon completion of cleaning, rinse sample shall be collected"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "As a primary verification of equipment cleanliness"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "keep the seeded intro; fill [limit]"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "keep the seeded four paragraphs"
    );
  });

  it("seeds Batch 1/2/3 result columns and a 15.0 batch execution table", () => {
    const residue = summarizeTablesInDoc(cvpEquipmentSamplingSeed(1));
    const residueHeaders = residue.find((table) =>
      table.headers.includes("Sample ID")
    )?.headers;
    expect(residueHeaders).toEqual([...CVP_RESIDUE_RESULTS_HEADERS]);
    const sampling = EMPTY_CVP_CONTENT.cvp_sampling_plan;
    const tables = summarizeTablesInDoc(
      "narrative" in sampling ? sampling.narrative : { type: "doc", content: [] }
    );
    expect(tables[0]?.headers).toEqual([...CVP_BATCH_EXECUTION_HEADERS]);
    expect(
      tables[0]?.cells.filter((cell) => cell.col === 0 && cell.row > 0).map((cell) => cell.text)
    ).toEqual(["Batch 1", "Batch 2", "Batch 3"]);
    expect(EMPTY_CVP_CONTENT.cvp_nitrosamine).toHaveProperty("table");
    const nitro = summarizeTablesInDoc(
      "table" in EMPTY_CVP_CONTENT.cvp_nitrosamine
        ? EMPTY_CVP_CONTENT.cvp_nitrosamine.table
        : { type: "doc", content: [] }
    );
    expect(nitro[0]?.headers).toEqual([...CVP_NITROSAMINE_HEADERS]);
  });

  it("seeds ISM Stage-4 boilerplate on nitrosamine through revalidation", () => {
    const tableText = (key: keyof typeof EMPTY_CVP_CONTENT) =>
      JSON.stringify(
        "table" in EMPTY_CVP_CONTENT[key] ? EMPTY_CVP_CONTENT[key].table : {}
      );
    expect(tableText("cvp_nitrosamine")).toContain(CVP_NITROSAMINE_INTRO_SEED);
    expect(tableText("cvp_pgi")).toContain(CVP_PGI_INTRO_SEED);
    expect(tableText("cvp_process_line")).toContain(CVP_PROCESS_LINE_INTRO_SEED);
    expect(tableText("cvp_process_line")).toContain("Acceptance Criteria:");
    expect(tableText("cvp_manufacturing_area")).toContain(
      "lint-free white wipe cloth"
    );
    expect(tableText("cvp_testing_procedure")).toContain(
      CVP_TESTING_PROCEDURE_INTRO_SEED
    );
    expect(tableText("cvp_method_validation")).toContain(
      CVP_METHOD_VALIDATION_INTRO_SEED
    );
    const evaluation = JSON.stringify(EMPTY_CVP_CONTENT.cvp_evaluation);
    expect(evaluation).toContain(CVP_EVALUATION_SEEDS[0]);
    expect(evaluation).not.toContain("three consecutive cleaning batches each comply");
    expect(evaluation).toContain("concludes otherwise with QA approval");
    expect(JSON.stringify(EMPTY_CVP_CONTENT.cvp_deviations)).toContain(
      CVP_DEVIATIONS_SEED
    );
    expect(JSON.stringify(EMPTY_CVP_CONTENT.cvp_revalidation)).toContain(
      CVP_REVALIDATION_SEED
    );
  });

  it("prepends nitrosamine boilerplate onto a legacy table-only field at merge", () => {
    const def = getDocumentType("cleaning_verification_protocol");
    const legacyTable = {
      type: "doc" as const,
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [...CVP_NITROSAMINE_HEADERS].map((text) => ({
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text }] }],
              })),
            },
            {
              type: "tableRow",
              content: ["Limit NMT (ppm)", "", "", "", "", "", "", "", "", ""].map(
                (text) => ({
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                })
              ),
            },
          ],
        },
      ],
    };
    const merged = def.mergeSection("cvp_nitrosamine", {
      table: legacyTable,
    }) as { table: JSONContent };
    const text = JSON.stringify(merged.table);
    expect(text).toContain(CVP_NITROSAMINE_INTRO_SEED);
    expect(summarizeTablesInDoc(merged.table)[0]?.headers).toEqual([
      ...CVP_NITROSAMINE_HEADERS,
    ]);
    const again = def.mergeSection("cvp_nitrosamine", merged) as {
      table: JSONContent;
    };
    expect(
      JSON.stringify(again.table).split(CVP_NITROSAMINE_INTRO_SEED).length - 1
    ).toBe(1);
  });

  it("aligns leftover three-batch evaluation wording with the ISM Stage-4 seed", () => {
    const def = getDocumentType("cleaning_verification_protocol");
    const merged = def.mergeSection("cvp_evaluation", {
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "The cleaning procedure shall be considered validated when three consecutive cleaning batches each comply with the visual inspection, swab, rinse, extraneous matter, pH (wherever applicable), nitrosamine, and potential genotoxic impurities acceptance criteria defined in this protocol. A failed batch shall be investigated, and the count of consecutive batches restarts unless the investigation justifies otherwise.",
              },
            ],
          },
        ],
      },
    }) as { narrative: JSONContent };
    expect(JSON.stringify(merged.narrative)).toContain(CVP_EVALUATION_SEEDS[0]);
    expect(JSON.stringify(merged.narrative)).not.toContain(
      "three consecutive cleaning batches each comply"
    );
  });

  it("widens old Results columns to Batch 1/2/3 and is idempotent", () => {
    const oldResidue: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [...CVP_PREVIOUS_RESIDUE_RESULTS_HEADERS].map((text) => ({
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text }] }],
              })),
            },
            {
              type: "tableRow",
              content: ["Final rinse", "RS-1", "0.12"].map((text) => ({
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text }] }],
              })),
            },
          ],
        },
      ],
    };
    const upgraded = upgradeCvpValidationDoc(oldResidue);
    const tables = summarizeTablesInDoc(upgraded);
    expect(tables[0]?.headers).toEqual([...CVP_RESIDUE_RESULTS_HEADERS]);
    expect(
      tables[0]?.cells.filter((cell) => cell.row === 1).map((cell) => cell.text)
    ).toEqual(["Final rinse", "RS-1", "0.12", "(empty)", "(empty)"]);
    expect(summarizeTablesInDoc(upgradeCvpValidationDoc(upgraded))[0]?.headers).toEqual(
      [...CVP_RESIDUE_RESULTS_HEADERS]
    );
  });

  it("moves Limit, LOQ, and LOD into the last column and leaves Sample ID blank", () => {
    const row = (cells: string[]) => ({
      type: "tableRow" as const,
      content: cells.map((text) => ({
        type: "tableCell" as const,
        content: [
          {
            type: "paragraph" as const,
            content: text ? [{ type: "text" as const, text }] : [],
          },
        ],
      })),
    });
    const misplaced: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [...CVP_RESIDUE_RESULTS_HEADERS].map((text) => ({
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text }] }],
              })),
            },
            row(["Final Rinse Sample (Acetone)", "NA", "", "", ""]),
            row(["Limit", "NMT 10 ppm", "", "", ""]),
            row(["LOQ", "5 ppm [3]", "", "", ""]),
            row(["LOD", "2 ppm", "", "", ""]),
          ],
        },
      ],
    };
    const cells = summarizeTablesInDoc(upgradeCvpValidationDoc(misplaced))[0]?.cells ?? [];
    const byLabel = (label: string) => {
      const rowIndex = cells.find((cell) => cell.col === 0 && cell.text === label)?.row;
      return cells
        .filter((cell) => cell.row === rowIndex)
        .sort((a, b) => a.col - b.col)
        .map((cell) => cell.text);
    };
    expect(byLabel("Final Rinse Sample (Acetone)")).toEqual([
      "Final Rinse Sample (Acetone)",
      "NA",
      "(empty)",
      "(empty)",
      "(empty)",
    ]);
    expect(byLabel("Limit")).toEqual([
      "Limit",
      "(empty)",
      "(empty)",
      "(empty)",
      "NMT 10 ppm",
    ]);
    expect(byLabel("LOQ")).toEqual([
      "LOQ",
      "(empty)",
      "(empty)",
      "(empty)",
      "5 ppm [3]",
    ]);
    expect(byLabel("LOD")).toEqual([
      "LOD",
      "(empty)",
      "(empty)",
      "(empty)",
      "2 ppm",
    ]);
  });

  it("triples filled nitrosamine equipment rows and leaves Limit NMT once", () => {
    const old: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [...CVP_PREVIOUS_NITROSAMINE_HEADERS].map((text) => ({
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text }] }],
              })),
            },
            {
              type: "tableRow",
              content: ["Limit NMT (ppm)", "", "0.1", "", "", "", "", "", ""].map(
                (text) => ({
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                })
              ),
            },
            {
              type: "tableRow",
              content: ["GLR", "GLR-1302", "", "", "", "", "", "", ""].map((text) => ({
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text }] }],
              })),
            },
          ],
        },
      ],
    };
    const tables = summarizeTablesInDoc(upgradeCvpValidationDoc(old));
    expect(tables[0]?.headers).toEqual([...CVP_NITROSAMINE_HEADERS]);
    const firstCol = tables[0]?.cells
      .filter((cell) => cell.col === 0 && cell.row > 0)
      .map((c) => c.text);
    expect(firstCol).toEqual(["Limit NMT (ppm)", "GLR", "GLR", "GLR"]);
    const batchCol = tables[0]?.cells
      .filter((cell) => cell.col === 2 && cell.row > 0)
      .map((c) => c.text);
    expect(batchCol).toEqual(["(empty)", "Batch 1", "Batch 2", "Batch 3"]);
  });

  it("swaps untouched seed wording and leaves custom verification prose", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "It shall be written in the cleaning verification report.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "This verification protocol was drafted for the ISM4 train.",
            },
          ],
        },
      ],
    };
    const swapped = upgradeCvpValidationDoc(doc);
    const text = JSON.stringify(swapped);
    expect(text).toContain("It shall be written in the cleaning validation report.");
    expect(text).toContain("This verification protocol was drafted for the ISM4 train.");
  });

  it("adds the 15.0 batch execution table on merge of a legacy sampling-plan paragraph", () => {
    const def = getDocumentType("cleaning_verification_protocol");
    const merged = def.mergeSection("cvp_sampling_plan", {
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "This section records the sampling plan and acceptance criteria for each product-contact equipment in the train, followed by nitrosamine and potential genotoxic impurity limits, process-line and manufacturing-area verification, and the overall results table. Result and observation fields stay blank until the cleaning verification report is written.",
              },
            ],
          },
        ],
      },
    }) as { narrative: JSONContent };
    const tables = summarizeTablesInDoc(merged.narrative);
    expect(tables.some((table) => table.headers[0] === "Batch")).toBe(true);
    expect(JSON.stringify(merged.narrative)).toContain("cleaning validation report");
  });

  it("prints a product-specific title when the cover product is set", () => {
    expect(cvpPrintedDocumentTitle(cvpMetadataFrom({}))).toBe(
      "Cleaning Validation Protocol for Equipment and Associated Auxiliary Systems"
    );
    expect(
      cvpPrintedDocumentTitle(
        cvpMetadataFrom({ productName: "Isosorbide Mononitrate (ISM Stage-4)" })
      )
    ).toContain("Isosorbide Mononitrate (ISM Stage-4)");
  });
});
