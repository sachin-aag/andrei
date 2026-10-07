import { describe, expect, it } from "vitest";
import { getDocumentType } from "@/lib/document-types";
import {
  CVP_EQUIPMENT_H3_OUTLINE,
  CVP_EQUIPMENT_H4_OUTLINE,
  CVP_FORM_NO,
  CVP_SECTION_KEYS,
  CVP_TABLE_SECTION_KEYS,
  EMPTY_CVP_CONTENT,
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
    expect(tables[0]?.headers[0]).toBe("S. No.");
    expect(tables[1]?.headers[0]).toBe("Attribute");
    expect(tables[2]?.headers[0]).toBe("Attribute");
    expect(tables[1]?.cells.some((cell) => cell.text === "PDE")).toBe(true);
    expect(tables[2]?.cells.some((cell) => cell.text === "MAXCONC")).toBe(true);
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

  it("seeds one 15.1 equipment sampling box with H2–H4 outline headings", () => {
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
    expect(headings[0]).toEqual({
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
    expect(headings.map((h) => h.text)).toEqual(
      expect.arrayContaining([
        ...CVP_EQUIPMENT_H3_OUTLINE.map((item) => `${item.number} ${item.title}`),
        ...CVP_EQUIPMENT_H4_OUTLINE.map((item) => `${item.number} ${item.title}`),
      ])
    );
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

  it("prints a product-specific title when the cover product is set", () => {
    expect(cvpPrintedDocumentTitle(cvpMetadataFrom({}))).toBe(
      "Cleaning Verification Protocol for Equipment and Associated Auxiliary Systems"
    );
    expect(
      cvpPrintedDocumentTitle(
        cvpMetadataFrom({ productName: "Isosorbide Mononitrate (ISM Stage-4)" })
      )
    ).toContain("Isosorbide Mononitrate (ISM Stage-4)");
  });
});
