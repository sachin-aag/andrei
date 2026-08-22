import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reports } from "@/db/schema";
import {
  DV_SECTION_KEYS,
  EMPTY_DV_CONTENT,
} from "@/lib/document-types/design-verification/sections";
import {
  CONVERGENT_DV_SECTION_KEYS,
  EMPTY_CONVERGENT_DV_CONTENT,
} from "@/lib/document-types/convergent/sections";
import {
  reportExportDocxArchiveName,
  reportExportDocxFileName,
} from "@/lib/export/docx-filename";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { readPngDimensions } from "@/lib/export/raster-dimensions";
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

    const header = new PizZip(dv).file("word/header2.xml")?.asText() ?? "";
    expect(header).toContain("Design Verification Report");
    expect(header).toContain("Andrei");
    expect(header).not.toMatch(/<w:t>Ref<\/w:t>/);
    expect(header).not.toMatch(/<w:t>,<\/w:t>/);
    expect(header).not.toMatch(/<w:t>\.<\/w:t>/);
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
    expect(header).not.toMatch(/<w:t>Ref<\/w:t>/);
    expect(header).not.toMatch(/<w:t>,<\/w:t>/);
    expect(header).not.toMatch(/<w:t>\.<\/w:t>/);

    const logoPng = new PizZip(buf).file("word/media/image1.png")?.asNodeBuffer();
    expect(logoPng).toBeDefined();
    const logoDims = readPngDimensions(logoPng!)!;
    const wpCy = Number(header.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)?.[2]);
    const picCy = Number(header.match(/<a:xfrm>\s*<a:off [^/]*\/>\s*<a:ext cx="\d+" cy="(\d+)"\/>/)?.[1]);
    const wpCx = Number(header.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)?.[1]);
    const expectedCy = Math.round((wpCx * logoDims.height) / logoDims.width);
    expect(wpCy).toBe(expectedCy);
    expect(picCy).toBe(expectedCy);
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

const CONVERGENT_TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "convergent-design-verification-report-template.docx"
);

function convergentSections(): ReportSectionRecord[] {
  const reportId = "dv-export-1";
  return CONVERGENT_DV_SECTION_KEYS.map((section, i) => ({
    id: `sec-${section}-${i}`,
    reportId,
    section,
    content:
      section === "purpose"
        ? {
            narrative: narrativeDoc(
              "Verify Solea output REQ-101 meets the laser energy specification."
            ),
          }
        : section === "testers_dates"
          ? {
              testers: narrativeDoc(
                "Alex Rivera, independent test engineer. Test dates: 2026-03-01 through 2026-03-04."
              ),
            }
          : EMPTY_CONVERGENT_DV_CONTENT[section],
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

describe("convergent design-verification DOCX export", () => {
  const previous = {
    ANDREI_CUSTOMER: process.env.ANDREI_CUSTOMER,
    NEXT_PUBLIC_ANDREI_CUSTOMER: process.env.NEXT_PUBLIC_ANDREI_CUSTOMER,
    ANDREI_VERCEL_DEPLOY_SCOPE: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
  };

  beforeEach(() => {
    process.env.ANDREI_CUSTOMER = "convergent";
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER = "convergent";
    delete process.env.ANDREI_VERCEL_DEPLOY_SCOPE;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses a Convergent template with the 9-section placeholders", () => {
    const xml =
      new PizZip(fs.readFileSync(CONVERGENT_TEMPLATE)).file("word/document.xml")
        ?.asText() ?? "";
    expect(xml).toContain("Purpose");
    expect(xml).toContain("{@purposeXml}");
    expect(xml).toContain("{@equipmentXml}");
    expect(xml).toContain("{@resultsTableXml}");
    expect(xml).not.toContain("{testersStartDate}");
    expect(xml).not.toContain("{testersEndDate}");
    expect(xml).not.toContain("{@purposeScopeXml}");
    expect(xml).not.toContain("Purpose &amp; Scope");
    expect(xml).not.toContain("Define:");

    const header =
      new PizZip(fs.readFileSync(CONVERGENT_TEMPLATE)).file("word/header2.xml")
        ?.asText() ?? "";
    expect(header).toContain("Convergent Dental");
    expect(header).not.toContain("Andrei");
  });

  it("renders Convergent headings and tester dates", async () => {
    const buf = await generateReportDocx({
      report: dvReport(),
      sections: convergentSections(),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    const header = new PizZip(buf).file("word/header2.xml")?.asText() ?? "";

    expect(header).toContain("Convergent Dental");
    expect(header).toContain("Design Verification Report");
    expect(xml).toContain("DVR-100");
    expect(xml).toContain("Verify Solea output REQ-101 meets the laser energy specification.");
    expect(xml).toContain("Alex Rivera, independent test engineer.");
    expect(xml).toContain("2026-03-01");
    expect(xml).toContain("Testers");
    expect(xml).toContain("Methods of Measurement");
    expect(xml).toContain("CD Asset Tag");
    expect(xml).not.toContain("Purpose &amp; Scope");
    expect(xml).not.toContain("Define:");
  });
});
