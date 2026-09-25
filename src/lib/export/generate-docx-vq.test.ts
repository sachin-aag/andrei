import fs from "node:fs";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { reports } from "@/db/schema";
import { reportExportDocxFileName } from "@/lib/export/docx-filename";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { EMPTY_VQ_CONTENT, VQ_SECTION_KEYS } from "@/lib/document-types/vq/sections";
import { VQ_FORM_NO } from "@/lib/document-types/vq/schema";
import type { ReportSectionRecord } from "@/types/report";

const TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "3xper-vendor-qualification-template.docx"
);

function partText(zip: PizZip, name: string): string {
  const xml = zip.file(name)?.asText() ?? "";
  return Array.from(xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g), (m) => m[1] ?? "").join(
    ""
  );
}

function vqReport(): typeof reports.$inferSelect {
  return {
    id: "vq-export-1",
    documentType: "vendor_qualification",
    documentNo: "VQ-2026-001",
    date: new Date("2026-09-11"),
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    metadata: {
      formNo: VQ_FORM_NO,
      revision: "01",
    },
    status: "draft",
    createdAt: new Date("2026-09-11"),
    updatedAt: new Date("2026-09-11"),
  };
}

function vqSections(): ReportSectionRecord[] {
  return VQ_SECTION_KEYS.map((section, i) => {
    const base = EMPTY_VQ_CONTENT[section];
    const content =
      section === "vq_cover"
        ? {
            answers: {
              ...base.answers,
              cover_manufacturer: "Acme API Pvt Ltd",
              cover_material: "Lactose monohydrate",
            },
          }
        : base;
    return {
      id: `sec-${section}-${i}`,
      reportId: "vq-export-1",
      section,
      content,
      updatedAt: "2026-09-11T00:00:00.000Z",
    };
  });
}

describe("3xper VQ DOCX template", () => {
  it("is a valid A4 form cloned from the generic template", () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE));
    expect(Object.keys(zip.files)[0]).toBe("[Content_Types].xml");
    expect(zip.file("word/media/image1.png")).toBeTruthy();

    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(() => {
      const parsed = new DOMParser().parseFromString(xml, "text/xml");
      const err = parsed.getElementsByTagName("parsererror")[0];
      if (err) throw new Error(err.textContent ?? "invalid xml");
    }).not.toThrow();

    const header = partText(zip, "word/header2.xml");
    const footer = zip.file("word/footer1.xml")?.asText() ?? "";
    for (const text of [
      "Document Name",
      "VENDOR QUALIFICATION",
      "Document Number",
      "QAD-SOP-MS-001-F04",
      "Revision Number",
      "Page No",
      "Palachur Village,",
    ]) {
      expect(header, text).toContain(text);
    }
    expect(zip.file("word/header2.xml")?.asText()).toContain("NUMPAGES");
    for (const name of ["word/header1.xml", "word/header3.xml"]) {
      expect(partText(zip, name)).toBe(header);
    }
    expect(footer).toContain("{@vqFooterXml}");
    expect(xml).toContain("{@vqBodyXml}");
    expect(xml).not.toContain("TABLE OF CONTENTS");
    expect(xml).toContain('w:w="11909"');
  });
});

describe("3xper VQ DOCX export", () => {
  const previous = {
    ANDREI_CUSTOMER: process.env.ANDREI_CUSTOMER,
    NEXT_PUBLIC_ANDREI_CUSTOMER: process.env.NEXT_PUBLIC_ANDREI_CUSTOMER,
    ANDREI_VERCEL_DEPLOY_SCOPE: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
  };

  beforeEach(() => {
    process.env.ANDREI_CUSTOMER = "3xper";
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER = "3xper";
    process.env.ANDREI_VERCEL_DEPLOY_SCOPE = "3xper";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("renders cover identity, the form header and the page signature footer", async () => {
    const buf = await generateReportDocx({
      report: vqReport(),
      sections: vqSections(),
    });
    const zip = new PizZip(buf);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toMatch(/\{@?\w+Xml\}/);
    expect(xml).toContain("Acme API Pvt Ltd");
    expect(xml).toContain("Lactose monohydrate");
    expect(partText(zip, "word/header2.xml")).toContain(VQ_FORM_NO);
    const footer = partText(zip, "word/footer1.xml");
    expect(footer).not.toContain("{@vqFooterXml}");
    for (const text of ["Name of the Activity", "Prepared By", "Anantha Kumar D", "Head Quality", `Format: - ${VQ_FORM_NO}`]) {
      expect(footer, text).toContain(text);
    }
  });

  it("prints the cover's page signature rows in the footer", async () => {
    const sections = vqSections().map((row) =>
      row.section === "vq_cover"
        ? {
            ...row,
            content: {
              ...(row.content as object),
              pageSignatures: [
                { activity: "Prepared By", name: "Priya S", designation: "QA Officer", signature: "PS", date: "01-09-2026" },
              ],
            },
          }
        : row
    );
    const zip = new PizZip(await generateReportDocx({ report: vqReport(), sections }));
    const footer = partText(zip, "word/footer1.xml");
    expect(footer).toContain("Priya S");
    expect(footer).toContain("01-09-2026");
    expect(footer).not.toContain("Anantha Kumar D");
  });

  it("unifies citations at the end of the form", async () => {
    function cited(body: string, source: string) {
      return {
        type: "doc" as const,
        content: [
          { type: "paragraph", content: [{ type: "text", text: body }] },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "Citations:" }] },
          { type: "paragraph", content: [{ type: "text", text: `1. ${source}` }] },
        ],
      };
    }
    const sections = vqSections().map((row) => {
      if (row.section === "vq_section_a") {
        return {
          ...row,
          content: {
            ...(row.content as object),
            narrative: cited("Site comment recorded [1].", "[audit.pdf, p. 3]"),
          },
        };
      }
      if (row.section === "vq_section_g") {
        return {
          ...row,
          content: {
            ...(row.content as object),
            narrative: cited("Impurities are controlled [1].", "[ra.pdf, p. 1]"),
          },
        };
      }
      return row;
    });
    const zip = new PizZip(await generateReportDocx({ report: vqReport(), sections }));
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    const body = partText(zip, "word/document.xml");
    const citationsAt = xml.indexOf("CITATIONS");
    expect(citationsAt).toBeGreaterThan(xml.indexOf("Site comment recorded"));
    expect(citationsAt).toBeGreaterThan(xml.indexOf("Impurities are controlled"));
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(body).not.toContain("Citations:");
    expect(body).toContain("1. [audit.pdf, p. 3]");
    expect(body).toContain("2. [ra.pdf, p. 1]");
  });

  it("names the exported file for the VQ type", () => {
    expect(reportExportDocxFileName("vendor_qualification", "VQ-2026-001")).toBe(
      "Vendor_Qualification_VQ-2026-001.docx"
    );
  });
});
