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
    const footer = partText(zip, "word/footer1.xml");
    const body = partText(zip, "word/document.xml");
    expect(header).toContain("3xper");
    expect(header).toContain("Vendor Qualification");
    expect(header).toContain("MASTER COPY");
    expect(footer).toContain("QAD-SOP-MS-001-F04");
    expect(body).toContain("QAD-SOP-MS-001-F04");
    expect(body).toContain("Palachur");
    expect(xml).toContain("{@vqCoverXml}");
    expect(xml).toContain("{@vqSectionGXml}");
    expect(xml).toContain("{@vqScoringXml}");
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

  it("renders cover identity and the VQ number", async () => {
    const buf = await generateReportDocx({
      report: vqReport(),
      sections: vqSections(),
    });
    const zip = new PizZip(buf);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toMatch(/\{@?\w+Xml\}/);
    expect(xml).toContain("Acme API Pvt Ltd");
    expect(xml).toContain("Lactose monohydrate");
    expect(xml).toContain("VQ-2026-001");
    expect(xml).toContain(VQ_FORM_NO);
    expect(partText(zip, "word/header2.xml")).toContain("3xper");
    expect(partText(zip, "word/footer1.xml")).toContain("Anantha Kumar D");
  });

  it("names the exported file for the VQ type", () => {
    expect(reportExportDocxFileName("vendor_qualification", "VQ-2026-001")).toBe(
      "Vendor_Qualification_VQ-2026-001.docx"
    );
  });
});
