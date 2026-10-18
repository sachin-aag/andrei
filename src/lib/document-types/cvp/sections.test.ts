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
  CVP_CLEANING_OPERATION_INTRO_SEEDS,
  CVP_DEVIATIONS_SEED,
  CVP_EQUIPMENT_H3_OUTLINE,
  CVP_EQUIPMENT_H4_OUTLINE,
  CVP_EVALUATION_SEEDS,
  CVP_FORM_NO,
  CVP_MACO_EQUIPMENT_HEADERS,
  CVP_METHOD_VALIDATION_INTRO_SEED,
  CVP_NITROSAMINE_HEADERS,
  CVP_NITROSAMINE_INTRO_SEED,
  CVP_RESIDUE_LOD,
  CVP_RESIDUE_LOQ,
  CVP_REVALIDATION_SEED,
  CVP_SECTION_KEYS,
  CVP_TABLE_SECTION_KEYS,
  CVP_TESTING_PROCEDURE_INTRO_SEED,
  CVP_VISUAL_INSPECTION_HEADERS,
  CVP_METHODOLOGY_INTRO_SEED,
  CVP_PREREQUISITES_INTRO_SEED,
  CVP_SURFACE_AREA_INTRO_SEED,
  EMPTY_CVP_CONTENT,
  alignCvpMacoEquipmentHeaders,
  cvpEquipmentSamplingSeed,
  cvpMetadataFrom,
  cvpPrintedDocumentTitle,
  isCvpTableSectionKey,
  upgradeCvpEquipmentSamplingNarrative,
} from "./sections";
import { summarizeTablesInDoc } from "@/lib/suggestions/table-operation";

describe("cleaning verification protocol sections", () => {
  it("registers thirty F08 sections with a narrative or table field", () => {
    const def = getDocumentType("cleaning_verification_protocol");
    expect(def.key).toBe("cleaning_verification_protocol");
    expect(def.documentNoLabel).toBe("Protocol No.");
    expect(def.documentNoPlaceholder).toBe("e.g. CVLP-ISM4-26-001");
    expect(def.chat.identityFields?.map((field) => field.key)).toContain(
      "ccfNo"
    );
    expect(cvpMetadataFrom({ ccfNo: "CCF-12" }).ccfNo).toBe("CCF-12");
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
    const item = structuredClone(cvpEquipmentSamplingSeed(1));
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

  it("starts equipment sampling empty and seeds 15.N.3 / .6 on Add equipment", () => {
    const empty = EMPTY_CVP_CONTENT.cvp_equipment_sampling;
    expect(empty).toEqual({ items: [] });
    const nodes = cvpEquipmentSamplingSeed(1).content ?? [];
    const headings = nodes
      .filter((node) => node.type === "heading")
      .map((node) => ({
        level: node.attrs?.level,
        text: node.content?.[0]?.text,
      }));
    const tables = nodes.filter((node) => node.type === "table");
    const text = JSON.stringify(nodes);
    expect(headings).toContainEqual({
      level: 2,
      text: "15.1 Equipment name (Equipment No.)",
    });
    expect(headings).toContainEqual({
      level: 3,
      text: "15.1.1 Equipment details",
    });
    expect(headings).toContainEqual({
      level: 4,
      text: "15.1.3.1 Worst-case locations",
    });
    expect(headings).toContainEqual({
      level: 3,
      text: "15.1.6 Visual inspection summary",
    });
    expect(JSON.stringify(tables[0])).toContain("Capacity");
    expect(JSON.stringify(tables[0])).toContain("Shell height");
    expect(text).toContain("[Plant]");
    expect(text).toContain("Black and fiber particles should be absent");
    expect(headings.map((h) => h.text).join(" ")).not.toContain("15.1.4");
    expect(CVP_EQUIPMENT_H3_OUTLINE).toHaveLength(8);
    expect(CVP_EQUIPMENT_H4_OUTLINE[0]?.title).toBe("Worst-case locations");
    const reactor = JSON.stringify(cvpEquipmentSamplingSeed(1, "reactor"));
    const ssr = JSON.stringify(cvpEquipmentSamplingSeed(1, "ssr"));
    expect(reactor).toContain("15.1.4 Cleaning operation results summary");
    expect(ssr).toContain("15.1.4 Cleaning operation results summary");
    expect(ssr).toContain("Stainless steel reactor");
    expect(reactor).toContain(CVP_CLEANING_OPERATION_INTRO_SEEDS[0]);
    expect(reactor).toContain(CVP_CLEANING_OPERATION_INTRO_SEEDS[1]);
    expect(reactor).toContain("Reactor top dish near manhole");
    expect(reactor).toContain("Bottom discharge valve");
    expect(reactor).toContain("Thermowell bottom");
    expect(reactor).toContain("S-1");
    expect(reactor).toContain("Shell wall Level 1 (S-8a)");
    expect(reactor).toContain("Shell wall Level 3 (S-10d)");
    expect(reactor).toContain("S-8a–d");
    expect(reactor).toContain(
      "Shell wall Level 1 (four circumferential locations)"
    );
    expect(reactor).toContain(
      "Representative of upper shell cylindrical section."
    );
    expect(reactor).not.toContain("Shell wall Level 1 (0°)");
    const visual = summarizeTablesInDoc(cvpEquipmentSamplingSeed(1)).find(
      (table) =>
        table.headers[0] === "Sample description / location" &&
        !table.headers.includes("Sample ID")
    );
    expect(visual?.headers).toEqual([...CVP_VISUAL_INSPECTION_HEADERS]);
    expect(visual?.headers).not.toContain("Results");
  });

  it("seeds protocol responsibilities, pre-requisites, surface area, and methodology", () => {
    const responsibilities = JSON.stringify(EMPTY_CVP_CONTENT.cvp_responsibilities);
    expect(responsibilities).toContain("Collection of swab samples");
    expect(responsibilities).toContain("Grant clearance for equipment usage");
    expect(responsibilities).toContain("bulletList");
    const prerequisites = JSON.stringify(EMPTY_CVP_CONTENT.cvp_prerequisites);
    expect(prerequisites).toContain(CVP_PREREQUISITES_INTRO_SEED);
    expect(prerequisites).toContain("Calibration of Critical Instrumentation");
    expect(prerequisites).toContain("Personnel Training & Competency");
    const surface = JSON.stringify(EMPTY_CVP_CONTENT.cvp_surface_area);
    expect(surface).toContain(CVP_SURFACE_AREA_INTRO_SEED);
    expect(surface).toContain("Process lines surface area");
    expect(surface).toContain("Total surface area");
    const methodology = JSON.stringify(EMPTY_CVP_CONTENT.cvp_methodology);
    expect(methodology).toContain(CVP_METHODOLOGY_INTRO_SEED);
    expect(methodology).toContain("torch light");
    expect(methodology).toContain("Extraneous matter testing");
    expect(methodology).toContain("Cleaning Validation Report shall be prepared");
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
    expect(text).toContain("10 KL");
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
    expect(text).toContain("10 KL [1]");
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
    expect(def.prompts.promptVersion).toBe("3xper-cvp-f08-v5");
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
      "Execution cells stay blank"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "Equipment sampling (15.1, 15.2, …) is a **protocol**, not a report"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain("Limit NMT is 0.01 ppm");
    expect(CVP_DRAFTING_GUIDANCE).toContain("D > 1 m → four");
    expect(CVP_DRAFTING_GUIDANCE).toContain("never RCVD");
    expect(CVP_DRAFTING_GUIDANCE).toContain("Stainless steel reactor");
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "Do not write that samples were sent"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain("Do not add a PGI section");
    expect(CVP_DRAFTING_GUIDANCE).toContain("Overall results (21.0)");
    expect(CVP_DRAFTING_GUIDANCE).toContain(
      "LOQ NMT 1 ppm and LOD NMT 0.3 ppm sit in the Results columns"
    );
    expect(CVP_DRAFTING_GUIDANCE).toContain("Acceptance limits (11.0");
    expect(CVP_DRAFTING_GUIDANCE).toContain("tableGuidance");
    expect(CVP_DRAFTING_GUIDANCE).toContain("header shape");
  });

  it("seeds grouped Results columns and no 15.0 batch execution table", () => {
    const residue = summarizeTablesInDoc(cvpEquipmentSamplingSeed(1)).find((table) =>
      table.headers.includes("Sample ID")
    );
    const residueHeaders = residue?.headers;
    expect(residueHeaders?.[0]).toBe("Sample description / location");
    expect(residueHeaders).toContain("Results");
    const loqRowIndex = residue?.cells.find(
      (cell) => cell.col === 0 && cell.text === "LOQ"
    )?.row;
    const loqRow = residue?.cells
      .filter((cell) => cell.row === loqRowIndex)
      .sort((a, b) => a.col - b.col)
      .map((cell) => cell.text);
    expect(loqRow).toEqual([
      "LOQ",
      "(empty)",
      "(empty)",
      CVP_RESIDUE_LOQ,
      CVP_RESIDUE_LOQ,
      CVP_RESIDUE_LOQ,
    ]);
    const sampling = EMPTY_CVP_CONTENT.cvp_sampling_plan;
    const tables = summarizeTablesInDoc(
      "narrative" in sampling ? sampling.narrative : { type: "doc", content: [] }
    );
    expect(tables).toHaveLength(0);
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
    expect(tableText("cvp_nitrosamine")).toContain("0.01 ppm");
    expect(EMPTY_CVP_CONTENT).not.toHaveProperty("cvp_pgi");
    expect(tableText("cvp_process_line")).toContain("process lines");
    expect(tableText("cvp_manufacturing_area")).toContain("white wipe");
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

  it("seeds Manufacturing Areas in the first overall-results column", () => {
    const overall = EMPTY_CVP_CONTENT.cvp_overall_results;
    const cells =
      summarizeTablesInDoc(
        "narrative" in overall ? overall.narrative : { type: "doc", content: [] }
      )[0]?.cells ?? [];
    const label = cells.find((cell) => cell.text === "Manufacturing Areas");
    expect(label?.col).toBe(0);
    expect(cells.find((cell) => cell.row === label?.row && cell.col === 1)?.text).toBe(
      "(empty)"
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


  it("does not inject a batch execution table into sampling plan when none is stored", () => {
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
                text: "Sampling plan overview for the equipment train.",
              },
            ],
          },
        ],
      },
    }) as { narrative: JSONContent };
    const tables = summarizeTablesInDoc(merged.narrative);
    expect(tables.some((table) => table.headers[0] === "Batch")).toBe(false);
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
