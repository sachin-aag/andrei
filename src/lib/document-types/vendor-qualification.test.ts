import { describe, expect, it } from "vitest";
import {
  citationsAtEndOfSectionFor,
  evaluationCapabilityFor,
  getDocumentType,
  isWordImportAvailable,
} from "@/lib/document-types";
import { XPER_PACK } from "@/lib/customers/packs";
import { VQ_FORM, fieldsForSection } from "@/lib/document-types/vq/schema";
import { EMPTY_VQ_CONTENT, VQ_SECTION_KEYS } from "@/lib/document-types/vq/sections";
import { questionnaireXml, vqTemplateKey } from "@/lib/document-types/vq/export-xml";
import { sectionFillState } from "@/lib/ai/chat/fields";

describe("vendor qualification type", () => {
  it("is a 16-section questionnaire with criteria and no Word import", () => {
    const def = getDocumentType("vendor_qualification");
    expect(def.sections.map((s) => s.key)).toEqual([...VQ_SECTION_KEYS]);
    expect(evaluationCapabilityFor(def)).toEqual({ kind: "criteria" });
    expect(def.documentNoLabel).toBe("VQ Number");
    expect(isWordImportAvailable("vendor_qualification", XPER_PACK)).toBe(false);
    expect(citationsAtEndOfSectionFor("vendor_qualification")).toBe(true);
    expect(def.export.templatePath).toContain(
      "3xper-vendor-qualification-template.docx"
    );
  });

  it("keeps questionnaire field ids unique within each section", () => {
    for (const key of VQ_SECTION_KEYS) {
      const ids = fieldsForSection(key).map((field) => field.id);
      expect(new Set(ids).size, key).toBe(ids.length);
      expect(VQ_FORM[key]).toBeDefined();
    }
  });

  it("merges answers without dropping narrative", () => {
    const def = getDocumentType("vendor_qualification");
    const merged = def.mergeSection("vq_cover", {
      answers: { cover_manufacturer: "Acme API" },
      narrative: { type: "doc", content: [{ type: "paragraph" }] },
    }) as { answers: Record<string, string> };
    expect(merged.answers.cover_manufacturer).toBe("Acme API");
  });

  it("renders questionnaire answers into Word XML", () => {
    const xml = questionnaireXml("vq_cover", {
      cover_manufacturer: "Acme API Pvt Ltd",
      cover_material: "Lactose monohydrate",
    });
    expect(xml).toContain("Acme API Pvt Ltd");
    expect(xml).toContain("Lactose monohydrate");
    expect(xml).toContain("<w:tbl>");
  });

  it("maps section keys onto the Word template camelCase tags", () => {
    expect(vqTemplateKey("vq_cover")).toEqual({
      fields: "vqCoverXml",
      narrative: "vqCoverNarrativeXml",
      table: "vqCoverTableXml",
    });
    expect(vqTemplateKey("vq_section_a").fields).toBe("vqSectionAXml");
    expect(vqTemplateKey("vq_scoring").fields).toBe("vqScoringXml");
  });

  it("treats empty answers as empty and filled Yes/No as filled", () => {
    expect(sectionFillState(EMPTY_VQ_CONTENT.vq_cover, "vq_cover")).toBe(
      "empty"
    );
    expect(
      sectionFillState(
        { answers: { a_1_2: "yes", a_1_1_1: "Acme API" } },
        "vq_section_a"
      )
    ).not.toBe("empty");
  });

  it("requires manufacturer and material before submit", () => {
    const def = getDocumentType("vendor_qualification");
    expect(
      def.submitValidation?.({
        report: { documentNo: "VQ-1" } as never,
        sections: [{ section: "vq_cover", content: { answers: {} } }],
      })
    ).toEqual({
      ok: false,
      message: "Name the manufacturer and the material on Cover before submitting.",
    });
    expect(
      def.submitValidation?.({
        report: { documentNo: "VQ-1" } as never,
        sections: [
          {
            section: "vq_cover",
            content: {
              answers: {
                cover_manufacturer: "Acme",
                cover_material: "Lactose",
              },
            },
          },
        ],
      })
    ).toEqual({ ok: true });
  });
});
