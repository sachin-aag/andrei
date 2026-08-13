import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { reports } from "@/db/schema";
import {
  DV_SECTION_KEYS,
  EMPTY_DV_CONTENT,
} from "@/lib/document-types/design-verification/sections";
import {
  reportExportDocxArchiveName,
  reportExportDocxFileName,
} from "@/lib/export/docx-filename";
import { generateReportDocx } from "@/lib/export/generate-docx";
import type { ReportSectionRecord } from "@/types/report";

const IR_TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "investigation-report-template.docx"
);
const DV_TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "design-verification-report-template.docx"
);

function narrativeDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function dvReport(
  overrides?: Partial<typeof reports.$inferSelect>
): typeof reports.$inferSelect {
  return {
    id: "dv-export-1",
    documentType: "design_verification",
    documentNo: "DVR-100",
    date: new Date("2026-04-08"),
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    metadata: { revision: "C", productName: "Solea Cart" },
    status: "draft",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function dvSections(): ReportSectionRecord[] {
  const reportId = "dv-export-1";
  const keys = ["cover_page", ...DV_SECTION_KEYS] as const;
  return keys.map((section, i) => ({
    id: `sec-${section}-${i}`,
    reportId,
    section,
    content:
      section === "cover_page"
        ? {}
        : section === "purpose_scope"
          ? {
              narrative: narrativeDoc(
                "Verify output REQ-101 meets the laser energy specification."
              ),
            }
          : EMPTY_DV_CONTENT[section],
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

describe("design-verification DOCX export", () => {
  it("uses a template that is not a copy of the investigation report", () => {
    const ir = fs.readFileSync(IR_TEMPLATE);
    const dv = fs.readFileSync(DV_TEMPLATE);
    expect(Buffer.compare(ir, dv)).not.toBe(0);

    const xml = new PizZip(dv).file("word/document.xml")?.asText() ?? "";
    expect(xml).toContain("Purpose &amp; Scope");
    expect(xml).toContain("{@purposeScopeXml}");
    expect(xml).toContain("{@traceabilityXml}");
    expect(xml).not.toContain("Define:");
    expect(xml).not.toContain("Investigation tool used");
    expect(xml).not.toContain("Deviation No.");
  });

  it("renders DV headings, cover fields, and matrices instead of DMAIC", async () => {
    const buf = await generateReportDocx({
      report: dvReport(),
      sections: dvSections(),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    const header = new PizZip(buf).file("word/header2.xml")?.asText() ?? "";

    expect(header).toContain("Design Verification Report");
    expect(header).not.toContain("Investigation Report");
    expect(xml).toContain("DVR-100");
    expect(xml).toContain("Solea Cart");
    expect(xml).toContain("Purpose &amp; Scope");
    expect(xml).toContain("Traceability");
    expect(xml).toContain("Test Results");
    expect(xml).toContain("Requirement ID");
    expect(xml).toContain("Verify output REQ-101 meets the laser energy specification.");
    expect(xml).not.toContain("Define:");
    expect(xml).not.toContain("Investigation tool used");
    expect(xml).not.toContain("6 M Method");
    expect(xml).not.toContain("Deviation No.");
  });

  it("names downloads and complete-record members by document type", () => {
    expect(reportExportDocxFileName("investigation_report", "DEV/01")).toBe(
      "Investigation_Report_DEV-01.docx"
    );
    expect(reportExportDocxFileName("design_verification", "DVR/01")).toBe(
      "Design_Verification_Report_DVR-01.docx"
    );
    expect(reportExportDocxArchiveName("investigation_report")).toBe(
      "investigation-report.docx"
    );
    expect(reportExportDocxArchiveName("design_verification")).toBe(
      "design-verification-report.docx"
    );
  });
});
