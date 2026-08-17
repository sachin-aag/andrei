import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { reports } from "@/db/schema";
import type { Ledger } from "@/lib/design-inputs/types";
import {
  EMPTY_TEST_REPORT_CONTENT,
  TEST_REPORT_SECTION_KEYS,
} from "@/lib/document-types/verification-test-report/sections";
import {
  reportExportDocxArchiveName,
  reportExportDocxFileName,
} from "@/lib/export/docx-filename";
import { generateReportDocx } from "@/lib/export/generate-docx";
import type { ReportSectionRecord } from "@/types/report";

const DV_TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "design-verification-report-template.docx"
);
const VTR_TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "convergent-test-report-template.docx"
);

const PRODUCT_ID = /SW-[A-Z]+-|\bJ[1-8]\b|Ophir|Solea|Convergent/i;

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

const SAMPLE_LEDGER: Ledger = {
  requirements: [
    {
      id: "REQ-1",
      text: "Widget shall boot",
      family: "REQ",
      removedInRev: null,
      deferred: false,
      applicabilityNote: null,
    },
  ],
  scope: [
    {
      reqId: "REQ-1",
      release: "1.0",
      jCode: "C1",
      requiredConfigs: ["CFG-A"],
    },
  ],
  blocks: [
    {
      id: "boot",
      title: "Boot test",
      pages: { start: 1, end: 1 },
      declaredReqIds: ["REQ-1"],
      bannerReqIds: [],
      bannerDuplicateIds: [],
      testedReqIds: ["REQ-1"],
      tildeHits: [],
      nonNormativeHits: { na: 0, should: 0, ifNeeded: 0, appropriate: 0 },
      instrumentsNamed: [],
    },
  ],
  equipmentTable: [],
  referencesTable: [],
};

function vtrReport(
  overrides?: Partial<typeof reports.$inferSelect>
): typeof reports.$inferSelect {
  return {
    id: "vtr-export-1",
    documentType: "verification_test_report",
    documentNo: "VTR-100",
    date: new Date("2026-04-08"),
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    metadata: { revision: "A", productName: "Example Device" },
    status: "draft",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function vtrSections(): ReportSectionRecord[] {
  const reportId = "vtr-export-1";
  const keys = ["cover_page", ...TEST_REPORT_SECTION_KEYS] as const;
  return keys.map((section, i) => ({
    id: `sec-${section}-${i}`,
    reportId,
    section,
    content:
      section === "cover_page"
        ? {}
        : section === "design_inputs"
          ? SAMPLE_LEDGER
          : section === "purpose"
            ? {
                narrative: narrativeDoc(
                  "Verify the firmware meets the stated requirements."
                ),
              }
            : section === "methods_of_measurement"
              ? {
                  ...EMPTY_TEST_REPORT_CONTENT.methods_of_measurement,
                  protocolModifications: {
                    sourceProtocolReportId: "proto-1",
                    pulledAt: "2026-08-16T00:00:00.000Z",
                    rows: [
                      {
                        findingId: "F-1",
                        blockId: null,
                        kind: "modified",
                        target: "plan",
                        before: "config A",
                        after: "config B",
                        rationale: "applicability",
                        status: "accepted",
                      },
                    ],
                  },
                }
              : EMPTY_TEST_REPORT_CONTENT[
                  section as keyof typeof EMPTY_TEST_REPORT_CONTENT
                ],
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

describe("verification-test-report DOCX export", () => {
  it("keeps the exporter free of product IDs", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/export/verification-test-report-docx.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/SW-[A-Z]+-|\bJ[1-8]\b|Ophir/i);
  });

  it("uses a generic template distinct from design verification", () => {
    const dv = fs.readFileSync(DV_TEMPLATE);
    const vtr = fs.readFileSync(VTR_TEMPLATE);
    expect(Buffer.compare(dv, vtr)).not.toBe(0);

    const xml = new PizZip(vtr).file("word/document.xml")?.asText() ?? "";
    expect(xml).toContain("PURPOSE");
    expect(xml).toContain("{@purposeXml}");
    expect(xml).toContain("SOFTWARE UNDER TEST");
    expect(xml).toContain("RESULTS AND DISCUSSION");
    expect(xml).toContain("{@resultsXml}");
    expect(xml).not.toContain("Purpose &amp; Scope");
    expect(xml).not.toContain("Define:");
    expect(xml).not.toMatch(PRODUCT_ID);

    const header = new PizZip(vtr).file("word/header2.xml")?.asText() ?? "";
    expect(header).toContain("Verification Test Report");
    expect(header).not.toContain("Design Verification Report");
    expect(header).not.toMatch(PRODUCT_ID);
  });

  it("renders generic headings, generated Requirements Verified, and a computed modification count", async () => {
    const buf = await generateReportDocx({
      report: vtrReport(),
      sections: vtrSections(),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    const header = new PizZip(buf).file("word/header2.xml")?.asText() ?? "";

    expect(header).toContain("Verification Test Report");
    expect(xml).toContain("VTR-100");
    expect(xml).toContain("Example Device");
    expect(xml).toContain("PURPOSE");
    expect(xml).toContain("SCOPE");
    expect(xml).toContain("SOFTWARE UNDER TEST");
    expect(xml).toContain("Requirements Verified");
    expect(xml).toContain("CONCLUSION");
    expect(xml).toContain("Verify the firmware meets the stated requirements.");
    expect(xml).toContain("REQ-1");
    expect(xml).toContain("Widget shall boot");
    expect(xml).toContain("one (1)");
    expect(xml).toContain("F-1");
    expect(xml).not.toMatch(/Pass\s*\/\s*Fail/i);
    expect(xml).not.toContain("Define:");
    expect(xml).not.toContain("Investigation tool used");
    expect(xml).not.toMatch(/SW-[A-Z]+-|\bJ[1-8]\b|Ophir/i);
  });

  it("names downloads by document type", () => {
    expect(reportExportDocxFileName("verification_test_report", "VTR/01")).toBe(
      "Verification_Test_Report_VTR-01.docx"
    );
    expect(reportExportDocxArchiveName("verification_test_report")).toBe(
      "verification-test-report.docx"
    );
  });
});
