import { describe, expect, it } from "vitest";
import {
  citationsAtEndOfSectionFor,
  evaluationCapabilityFor,
  getDocumentType,
  isWordImportAvailable,
} from "@/lib/document-types";
import { XPER_PACK } from "@/lib/customers/packs";
import { DOMParser } from "@xmldom/xmldom";
import {
  VQ_FORM,
  VQ_FORM_OWNERS,
  fieldsForSection,
  vqFieldAnswerIds,
  vqFieldCaption,
} from "@/lib/document-types/vq/schema";
import {
  EMPTY_VQ_CONTENT,
  VQ_SECTION_KEYS,
  type VqSectionContent,
  type VqSectionKey,
} from "@/lib/document-types/vq/sections";
import {
  vqBodyXml,
  vqPageFooterXml,
  vqTableRows,
} from "@/lib/document-types/vq/export-xml";
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
      const ids = fieldsForSection(key).flatMap((field) => [
        field.id,
        ...vqFieldAnswerIds(field).filter((id) => id !== field.id),
      ]);
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

  it("defaults the per-page signature table to the three form owners", () => {
    const def = getDocumentType("vendor_qualification");
    const fresh = def.mergeSection("vq_cover", undefined) as VqSectionContent;
    expect(fresh.pageSignatures?.map((row) => row.activity)).toEqual([
      "Prepared By",
      "Reviewed By",
      "Approved By",
    ]);
    expect(fresh.pageSignatures?.[0]?.name).toBe(VQ_FORM_OWNERS[0].name);

    const edited = def.mergeSection("vq_cover", {
      answers: {},
      pageSignatures: [
        { activity: "Prepared By", name: "A", designation: "QA", signature: "", date: "1/1" },
        { activity: "Checked By", name: "B" },
        "junk",
      ],
    }) as VqSectionContent;
    expect(edited.pageSignatures).toHaveLength(2);
    expect(edited.pageSignatures?.[1]).toEqual({
      activity: "Checked By",
      name: "B",
      designation: "",
      signature: "",
      date: "",
    });
  });

  it("prints the per-page signature table and format line for the footer", () => {
    const xml = vqPageFooterXml([
      { activity: "Prepared By", name: "Anantha Kumar D", designation: "QAD", signature: "", date: "20-08-2025" },
    ]);
    expect(xml).toContain("Name of the Activity");
    expect(xml).toContain("Anantha Kumar D");
    expect(xml).toContain("20-08-2025");
    expect(xml).toContain("Format: - QAD-SOP-MS-001-F04");
  });

  it("reads matrix rows from a TipTap table and drops the header row", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "S. No" }] }] }] },
            { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "1." }] }] }] },
            { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph" }] }] },
          ],
        },
      ],
    };
    expect(vqTableRows(doc, ["S. No"])).toEqual([["1."]]);
  });
});

function body(sections: Partial<Record<VqSectionKey, VqSectionContent>>): string {
  return vqBodyXml({ sections, render: () => "<w:p/>" });
}

describe("vendor qualification Word body", () => {
  it("is well-formed XML with a consistent grid in every table", () => {
    const xml = body({});
    const doc = new DOMParser().parseFromString(
      `<w:body xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xml}</w:body>`,
      "text/xml"
    );
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    const tables = Array.from(doc.getElementsByTagName("w:tbl"));
    expect(tables.length).toBeGreaterThan(15);
    for (const tbl of tables) {
      const gridCols = tbl.getElementsByTagName("w:gridCol").length;
      for (const tr of Array.from(tbl.getElementsByTagName("w:tr"))) {
        const spans = Array.from(tr.getElementsByTagName("w:tc")).reduce(
          (sum, tc) => {
            const span = tc.getElementsByTagName("w:gridSpan")[0];
            return sum + Number(span?.getAttribute("w:val") ?? 1);
          },
          0
        );
        expect(spans).toBe(gridCols);
      }
    }
  });

  it("prints the cover fields from the paper form", () => {
    const xml = body({
      vq_cover: {
        answers: {
          cover_rm_ksm: "yes",
          cover_manufacturer: "Somu Organo-Chem (P) Ltd.",
          cover_material: "1,3-Cyclohexanedione",
          cover_req_A: "yes",
        },
      },
    });
    for (const text of [
      "To be filled by",
      "3XPER INNOVENTURE LTD",
      "Type of RM Manufacturing",
      "Key Starting Material (KSM)",
      "Somu Organo-Chem (P) Ltd.",
      "1,3-Cyclohexanedione",
      "KSM Vendor Assessment Requirement",
      "Document Issued By (Quality Assurance)",
      "SUPPLIER QUALITY QUESTIONNAIRE",
    ]) {
      expect(xml, text).toContain(text);
    }
    expect(xml).toContain("☑");
  });

  it("prints sections in paper order with the vendor completion after J", () => {
    const xml = body({});
    const order = [
      "VENDOR SECTION",
      "A: General Information on Company, Product and Quality Management",
      "B. *TSE/BSE Risk Analysis Survey",
      "J. *Nitrosamine Impurity Questionnaire",
      "9. Summary of vendor assessment:",
      "Completion Signatures:",
      "Interim Approval of Vendor Qualification",
      "K. Willingness to inspection",
      "N. Audit Checklist",
      "Audit CAPA Summary and Status",
      "Summary of vendor Assessment:",
      "Approval of Vendor Qualification: (3xper Innoventure Ltd)",
    ];
    let from = 0;
    for (const text of order) {
      const at = xml.indexOf(text, from);
      expect(at, text).toBeGreaterThan(-1);
      from = at + text.length;
    }
  });

  it("prints Yes/No/N.A. boxes, Ref cells and one leading star", () => {
    const xml = body({
      vq_section_a: {
        answers: {
          a_1_6_2: "SOCPL/SMF-01",
          a_3_1: "yes",
          a_3_1__ref: "ISO 9001",
          a_4_1_1: "yes",
          a_4_1_1__ref: "IMS-AM01",
        },
      },
    });
    expect(xml).toContain("*Please give a brief structure-diagram");
    expect(xml).not.toContain("**Please");
    expect(xml).toContain("SOCPL/SMF-01");
    expect(xml).toContain("ISO 9001");
    expect(xml).toContain("IMS-AM01");
    expect(xml).toContain(">Ref:<");
    expect(xml).toContain(">Reference<");
  });

  it("falls back to Section A identity for the B–F material header", () => {
    const xml = body({
      vq_section_a: { answers: { a_material_name: "1,3-CYCLOHEXANEDIONE", a_product_code: "S001 & S030" } },
    });
    const b = xml.indexOf("B. *TSE/BSE");
    expect(xml.indexOf("1,3-CYCLOHEXANEDIONE", b)).toBeGreaterThan(b);
    expect(xml.indexOf("S001 &amp; S030", b)).toBeGreaterThan(b);
  });
});

describe("vendor qualification answers", () => {
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

  it("prints one required star and keeps question casing", () => {
    const structure = fieldsForSection("vq_section_a").find(
      (field) => field.id === "a_1_6_2"
    );
    expect(structure).toBeDefined();
    expect(structure?.label.startsWith("*")).toBe(false);
    expect(vqFieldCaption(structure!)).toBe(
      "1.6.2 * Please give a brief structure-diagram"
    );
    expect(vqFieldCaption(structure!)).not.toMatch(/\* \*/);

    const enclose = fieldsForSection("vq_section_a").find(
      (field) => field.id === "a_1_6_5"
    );
    expect(vqFieldCaption(enclose!)).toBe(
      "1.6.5 If yes, please enclose the annual report / Sustainable report / declaration"
    );

    const citationStar = fieldsForSection("vq_section_a").find(
      (field) => field.id === "a_2_3_2"
    );
    expect(vqFieldCaption(citationStar!)).toContain("Dir. 95/2/EC*");
    expect(vqFieldCaption(citationStar!).startsWith("2.3.2. * ")).toBe(true);
  });
});
