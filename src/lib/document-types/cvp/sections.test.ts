import { describe, expect, it } from "vitest";
import { getDocumentType } from "@/lib/document-types";
import {
  CVP_FORM_NO,
  CVP_SECTION_KEYS,
  CVP_TABLE_SECTION_KEYS,
  EMPTY_CVP_CONTENT,
  cvpMetadataFrom,
  cvpPrintedDocumentTitle,
  isCvpTableSectionKey,
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
      const field = isCvpTableSectionKey(key) ? "table" : "narrative";
      expect(EMPTY_CVP_CONTENT[key]).toHaveProperty(field);
      expect(def.suggestTargetFieldPatterns[key]).toEqual([field]);
      expect(def.richFieldPaths[key]).toEqual([field]);
    }
    expect(CVP_TABLE_SECTION_KEYS).toContain("cvp_approvals");
    expect(isCvpTableSectionKey("cvp_objective")).toBe(false);
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
    const narrative =
      "narrative" in seed
        ? structuredClone(seed.narrative)
        : { type: "doc" as const, content: [] };
    const tableIndex =
      narrative.content?.findIndex((node) => node.type === "table") ?? -1;
    narrative.content?.splice(tableIndex, 0, {
      type: "paragraph",
      content: [{ type: "text", text: "Table 15. Cvp Equipment Sampling" }],
    });
    const def = getDocumentType("cleaning_verification_protocol");
    const merged = def.mergeSection("cvp_equipment_sampling", {
      narrative,
    }) as { narrative: { content?: Array<{ type?: string }> } };
    const text = JSON.stringify(merged);
    expect(text).not.toMatch(/Table 15/);
    expect(text).not.toMatch(/Cvp Equipment Sampling/);
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
