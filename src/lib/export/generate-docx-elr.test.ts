import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { reports } from "@/db/schema";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { docxParagraphPlainText } from "@/lib/export/docx-toc-headings";
import {
  ELR_DEFAULT_METADATA,
  ELR_SECTION_KEYS,
  EMPTY_ELR_CONTENT,
} from "@/lib/document-types/elr/sections";
import type { ReportSectionRecord } from "@/types/report";

const TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "mj-equipment-lifecycle-report-template.docx"
);

function paragraphStyle(xml: string, text: string): string | null {
  const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [];
  const para = paras.find((p) => docxParagraphPlainText(p) === text);
  return para?.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? null;
}

function elrReport(): typeof reports.$inferSelect {
  return {
    id: "elr-export-1",
    documentType: "equipment_lifecycle_report",
    documentNo: "ELR-26-PR-001",
    date: new Date("2026-03-09"),
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    metadata: {
      ...ELR_DEFAULT_METADATA,
      equipmentName: "Vial filling machine",
      equipmentId: "VF-01",
    },
    status: "draft",
    createdAt: new Date("2026-03-09"),
    updatedAt: new Date("2026-03-09"),
  };
}

function elrSections(): ReportSectionRecord[] {
  return ELR_SECTION_KEYS.map((section, i) => ({
    id: `sec-${section}-${i}`,
    reportId: "elr-export-1",
    section,
    content: EMPTY_ELR_CONTENT[section],
    updatedAt: "2026-03-09T00:00:00.000Z",
  }));
}

describe("ELR DOCX template", () => {
  it("does not include a static table of contents", () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE));
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toContain("TABLE OF CONTENTS");
    expect(xml).toContain("1.0 PURPOSE");
  });
});

describe("ELR DOCX export", () => {
  const previous = {
    ANDREI_CUSTOMER: process.env.ANDREI_CUSTOMER,
    NEXT_PUBLIC_ANDREI_CUSTOMER: process.env.NEXT_PUBLIC_ANDREI_CUSTOMER,
    ANDREI_VERCEL_DEPLOY_SCOPE: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
  };

  beforeEach(() => {
    process.env.ANDREI_CUSTOMER = "mj";
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER = "mj";
    delete process.env.ANDREI_VERCEL_DEPLOY_SCOPE;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("marks section titles as Word headings and omits a static TOC", async () => {
    const buf = await generateReportDocx({
      report: elrReport(),
      sections: elrSections(),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toContain("TABLE OF CONTENTS");
    expect(paragraphStyle(xml, "1.0 PURPOSE")).toBe("Heading1");
    expect(paragraphStyle(xml, "3.0 OBSERVATIONS AND RESULTS")).toBe("Heading1");
    expect(paragraphStyle(xml, "3.1 RESPONSIBILITY")).toBe("Heading2");
    expect(paragraphStyle(xml, "3.9.1 BREAKDOWN TREND SUMMARY")).toBe("Heading3");
    expect(paragraphStyle(xml, "9.0 APPROVAL PAGE")).toBe("Heading1");
  });
});
