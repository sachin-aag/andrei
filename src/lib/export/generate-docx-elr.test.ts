import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/react";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { reports } from "@/db/schema";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { docxParagraphPlainText } from "@/lib/export/docx-toc-headings";
import {
  ELR_ALARM_HEADERS,
  ELR_BREAKDOWN_HEADERS,
  ELR_DEFAULT_METADATA,
  ELR_MONITORING_HEADERS,
  ELR_QUALIFICATION_HEADERS,
  ELR_SECTION_KEYS,
  EMPTY_ELR_CONTENT,
} from "@/lib/document-types/elr/sections";
import type { ReportSectionRecord } from "@/types/report";

const TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "mj-equipment-lifecycle-report-template.docx"
);

function tableDoc(headers: string[], rows: string[][]): JSONContent {
  const headerRow: JSONContent = {
    type: "tableRow",
    content: headers.map((text) => ({
      type: "tableHeader",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    })),
  };
  const dataRows: JSONContent[] = rows.map((cells) => ({
    type: "tableRow",
    content: cells.map((text) => ({
      type: "tableCell",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    })),
  }));
  return {
    type: "doc",
    content: [{ type: "table", content: [headerRow, ...dataRows] }],
  };
}

const QUALIFICATION_ROWS = [
  [
    "1",
    "User Requirement Specification (URS)",
    "URS-FP-21-006",
    "Line-common",
    "13.07.2021",
    "Complies",
    "Nil",
    "NA",
    "Defines baseline user, operational, and regulatory requirements.",
  ],
  [
    "2",
    "Design Qualification (DQ)",
    "19063QE6SP02",
    "Line-common",
    "25.03.2023",
    "Complies",
    "Nil",
    "NA",
    "Design verified against URS specifications.",
  ],
  [
    "3",
    "Factory Acceptance Test (FAT)",
    "19063LIVAIQ41 / FAT OQ",
    "Line-common",
    "27.05.2023",
    "Complies",
    "Nil",
    "NA",
    "FAT executed at manufacturer site (Steriline S.r.l., Italy).",
  ],
  [
    "4",
    "Installation Qualification (IQ / SAT)",
    "19063LIVAIQ41",
    "Line-common",
    "11.03.2024",
    "Complies",
    "Nil",
    "NA",
    "Site installation and component verification in Room GF-89 found satisfactory.",
  ],
];

function qualificationTableSlice(xml: string): string {
  const start = xml.indexOf("3.4 QUALIFICATION");
  const end = xml.indexOf("3.5 MEDIA FILL");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return xml.slice(start, end);
}

function monitoringSlice(xml: string): string {
  const start = xml.indexOf("3.7 MONITORING");
  const end = xml.indexOf("3.8 CALIBRATION");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return xml.slice(start, end);
}

function breakdownSlice(xml: string): string {
  const start = xml.indexOf("3.10 BREAKDOWNS");
  const end = xml.indexOf("3.11 QMS");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return xml.slice(start, end);
}

function alarmSlice(xml: string): string {
  const start = xml.indexOf("3.6 ALARM TRENDS");
  const end = xml.indexOf("3.7 MONITORING");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return xml.slice(start, end);
}

function narrative(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function citedDoc(body: string, citations: string[]): JSONContent {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: body }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "Citations:" }] },
      ...citations.map((line) => ({
        type: "paragraph" as const,
        content: [{ type: "text", text: line }],
      })),
    ],
  };
}

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

function elrSections(
  overrides: Partial<typeof EMPTY_ELR_CONTENT> = {}
): ReportSectionRecord[] {
  return ELR_SECTION_KEYS.map((section, i) => ({
    id: `sec-${section}-${i}`,
    reportId: "elr-export-1",
    section,
    content: overrides[section] ?? EMPTY_ELR_CONTENT[section],
    updatedAt: "2026-03-09T00:00:00.000Z",
  }));
}

describe("ELR DOCX template", () => {
  it("does not include a static table of contents", () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE));
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toContain("TABLE OF CONTENTS");
    expect(xml).toContain("1.0 PURPOSE");
    expect(xml.indexOf("3.6 ALARM TRENDS")).toBeGreaterThan(-1);
    expect(xml.indexOf("3.6 ALARM TRENDS")).toBeLessThan(
      xml.indexOf("3.7 MONITORING")
    );
    expect(xml.indexOf("3.7 MONITORING")).toBeLessThan(
      xml.indexOf("3.10 BREAKDOWNS AND TRENDS")
    );
    expect(xml.indexOf("3.10 BREAKDOWNS AND TRENDS")).toBeLessThan(
      xml.indexOf("3.11 QMS RECORDS SINCE LAST PERIODIC RE-QUALIFICATION")
    );
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
      sections: elrSections({
        elr_risk_actions: {
          ...EMPTY_ELR_CONTENT.elr_risk_actions,
          overallGrade: "high",
        },
      }),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toContain("TABLE OF CONTENTS");
    expect(paragraphStyle(xml, "1.0 PURPOSE")).toBe("Heading1");
    expect(paragraphStyle(xml, "3.0 OBSERVATIONS AND RESULTS")).toBe("Heading1");
    expect(paragraphStyle(xml, "3.1 RESPONSIBILITY")).toBe("Heading2");
    expect(paragraphStyle(xml, "3.10.1 BREAKDOWN TREND SUMMARY")).toBe("Heading3");
    expect(paragraphStyle(xml, "5.0 SUMMARY AND CONCLUSION")).toBe("Heading1");
    expect(paragraphStyle(xml, "5.1 SYSTEM TRENDS AND PATTERNS")).toBe("Heading2");
    expect(paragraphStyle(xml, "5.2 RISK ASSESSMENT AND PRIORITIZED ACTIONS")).toBe(
      "Heading2"
    );
    expect(paragraphStyle(xml, "5.3 CONCLUSION")).toBe("Heading2");
    expect(paragraphStyle(xml, "9.0 APPROVAL PAGE")).toBe("Heading1");
    expect(xml).toContain("High risk");
  });

  it("prints the monitoring assessment before the evidence table", async () => {
    const assessment =
      "Period recorded 3 monitoring parameters. One excursion on particles was closed under DEV-26-011 and did not affect product.";
    const buf = await generateReportDocx({
      report: elrReport(),
      sections: elrSections({
        elr_monitoring: {
          ...EMPTY_ELR_CONTENT.elr_monitoring,
          narrative: narrative(assessment),
          table: tableDoc(
            [...ELR_MONITORING_HEADERS],
            [
              [
                "1",
                "Non-viable particle count",
                "Oct 2025 – Sep 2026",
                "EM-26-014",
                "Within alert limits except 12-Nov",
                "Y",
                "DEV-26-011",
              ],
            ]
          ),
        },
      }),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    const slice = monitoringSlice(xml);
    const assessmentAt = slice.indexOf("Period recorded 3 monitoring parameters");
    const tableAt = slice.indexOf("<w:tbl");
    const headerAt = slice.indexOf("Monitoring Parameter");
    expect(assessmentAt).toBeGreaterThan(-1);
    expect(tableAt).toBeGreaterThan(-1);
    expect(headerAt).toBeGreaterThan(tableAt);
    expect(assessmentAt).toBeLessThan(tableAt);
  });

  it("prints breakdown and alarm trend summaries between narrative and table", async () => {
    const buf = await generateReportDocx({
      report: elrReport(),
      sections: elrSections({
        elr_breakdowns: {
          ...EMPTY_ELR_CONTENT.elr_breakdowns,
          narrative: narrative(
            "Two breakdowns this period; 4.5 hours of downtime on the filling pump."
          ),
          trend: narrative(
            "Recurring peristaltic pump dosing faults imply a PM frequency review."
          ),
          table: tableDoc(
            [...ELR_BREAKDOWN_HEADERS],
            [
              [
                "1",
                "12-Nov-2025",
                "BD-26-003",
                "Peristaltic pump 3 dosing fault",
                "4.5",
                "Tubing replaced",
                "Vial",
                "Y",
                "CAPA-26-014",
              ],
            ]
          ),
        },
        elr_alarms: {
          ...EMPTY_ELR_CONTENT.elr_alarms,
          narrative: narrative(
            "Alarm 1951 repeated on Direct Impact filling stop."
          ),
          trend: narrative(
            "The trended alarm set still covers direct-impact filling stops."
          ),
          table: tableDoc(
            [...ELR_ALARM_HEADERS],
            [
              [
                "1",
                "1951",
                "Filling stop",
                "DI",
                "4",
                "ATR-26-011",
                "CAPA-26-014",
                "DEV-26-011",
              ],
            ]
          ),
        },
      }),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";

    const breakdown = breakdownSlice(xml);
    const breakdownNarrative = breakdown.indexOf("Two breakdowns this period");
    const breakdownHeading = breakdown.indexOf("3.10.1 BREAKDOWN TREND SUMMARY");
    const breakdownTrend = breakdown.indexOf("Recurring peristaltic pump");
    const breakdownTable = breakdown.indexOf("<w:tbl");
    expect(breakdownNarrative).toBeGreaterThan(-1);
    expect(breakdownHeading).toBeGreaterThan(breakdownNarrative);
    expect(breakdownTrend).toBeGreaterThan(breakdownHeading);
    expect(breakdownTable).toBeGreaterThan(breakdownTrend);

    const alarms = alarmSlice(xml);
    const alarmNarrative = alarms.indexOf("Alarm 1951 repeated");
    const alarmHeading = alarms.indexOf("3.6.1 ALARM TREND SUMMARY");
    const alarmTrend = alarms.indexOf("The trended alarm set still covers");
    const alarmTable = alarms.indexOf("<w:tbl");
    expect(alarmNarrative).toBeGreaterThan(-1);
    expect(alarmHeading).toBeGreaterThan(alarmNarrative);
    expect(alarmTrend).toBeGreaterThan(alarmHeading);
    expect(alarmTable).toBeGreaterThan(alarmTrend);
  });

  it("prints the proposed F22 format number on the title page", async () => {
    const buf = await generateReportDocx({
      report: elrReport(),
      sections: elrSections(),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    expect(xml).toContain("SOP/DP/QA/014/F22-R00 (proposed)");
  });

  it("does not print instructional template leftovers into the report", async () => {
    const buf = await generateReportDocx({
      report: elrReport(),
      sections: elrSections(),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toContain("Cumulative for the full life of the equipment");
    expect(xml).not.toContain("Aseptic process simulations covering this equipment");
    expect(xml).not.toContain(
      "Environmental, process-parameter and utility monitoring"
    );
    expect(xml).not.toContain("Record PM compliance for the period");
    expect(xml).not.toContain("Compiled from the approved alarm trend reports");
    expect(xml).not.toContain(
      "State whether the equipment remains in its qualified state"
    );
  });

  it("exports the 3.4 Qualification table on a landscape page", async () => {
    const buf = await generateReportDocx({
      report: elrReport(),
      sections: elrSections({
        elr_qualification: {
          ...EMPTY_ELR_CONTENT.elr_qualification,
          table: tableDoc([...ELR_QUALIFICATION_HEADERS], QUALIFICATION_ROWS),
        },
      }),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    const slice = qualificationTableSlice(xml);

    expect(slice).toContain("Qualification Stage");
    expect(slice).toContain("User Requirement Specification (URS)");
    expect(slice).toContain("URS-FP-21-006");
    expect(slice).toContain("19063QE6SP02");
    expect(slice).toContain("19063LIVAIQ41");
    expect(slice).toContain("Steriline S.r.l., Italy");
    expect(slice).toContain("Room GF-89");

    const tableAt = slice.indexOf("<w:tbl");
    const landscapeAt = slice.indexOf('w:orient="landscape"');
    const portraitBeforeTable = slice.slice(0, tableAt).includes("<w:pgSz");
    expect(tableAt).toBeGreaterThan(-1);
    expect(landscapeAt).toBeGreaterThan(tableAt);
    expect(portraitBeforeTable).toBe(true);

    const innerTables =
      slice.match(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g) ?? [];
    const qualificationInner =
      innerTables.find((table) => table.includes("Qualification Stage")) ?? "";
    const widths = [...qualificationInner.matchAll(/<w:gridCol w:w="(\d+)"/g)].map(
      (m) => Number(m[1])
    );
    expect(widths).toHaveLength(9);
    const gridSum = widths.reduce((sum, w) => sum + w, 0);
    expect(gridSum).toBeGreaterThan(10469);
    expect(gridSum).toBeLessThanOrEqual(15394);
  });

  it("fills 7.0 Attachments from every live file and unifies citations at 10.0", async () => {
    const buf = await generateReportDocx({
      report: elrReport(),
      sections: elrSections({
        elr_objective: {
          ...EMPTY_ELR_CONTENT.elr_objective,
          narrative: citedDoc("The URS was approved [1].", [
            "1. [urs.pdf, p. 2]",
          ]),
        },
        elr_qualification: {
          ...EMPTY_ELR_CONTENT.elr_qualification,
          narrative: citedDoc("IQ completed [1].", ["1. [iq.pdf, p. 4]"]),
        },
      }),
      attachments: [
        {
          id: "att-cited",
          reportId: "elr-export-1",
          folderId: "year",
          assetId: "asset-cited",
          filename: "URS-FP-21-006.pdf",
          description: null,
          mimeType: "application/pdf",
          sizeBytes: 10,
          pageCount: 8,
          processingStatus: "ready",
          processingProgress: 100,
          processingPage: null,
          processingError: null,
          uploadedAt: "2026-03-09T00:00:00.000Z",
          deletedAt: null,
        },
        {
          id: "att-uncited",
          reportId: "elr-export-1",
          folderId: null,
          assetId: "asset-uncited",
          filename: "uncited-scan.pdf",
          description: null,
          mimeType: "application/pdf",
          sizeBytes: 10,
          pageCount: null,
          processingStatus: "failed",
          processingProgress: 0,
          processingPage: null,
          processingError: "extract failed",
          uploadedAt: "2026-03-09T00:00:01.000Z",
          deletedAt: null,
        },
      ],
      attachmentFolders: [
        {
          id: "sops",
          reportId: "elr-export-1",
          parentId: null,
          name: "SOPs",
          createdAt: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "year",
          reportId: "elr-export-1",
          parentId: "sops",
          name: "2026",
          createdAt: "2026-03-09T00:00:00.000Z",
        },
      ],
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";

    const attachmentsAt = xml.indexOf("7.0 ATTACHMENTS");
    const revisionAt = xml.indexOf("8.0 REVISION HISTORY");
    const approvalAt = xml.indexOf("9.0 APPROVAL PAGE");
    const citationsAt = xml.indexOf("10.0 CITATIONS");
    expect(attachmentsAt).toBeGreaterThan(-1);
    expect(revisionAt).toBeGreaterThan(attachmentsAt);
    expect(approvalAt).toBeGreaterThan(revisionAt);
    expect(citationsAt).toBeGreaterThan(approvalAt);

    const attachmentsSlice = xml.slice(attachmentsAt, revisionAt);
    expect(attachmentsSlice).toContain("Location");
    expect(attachmentsSlice).toContain("URS-FP-21-006.pdf");
    expect(attachmentsSlice).toContain("/SOPs/2026");
    expect(attachmentsSlice).toContain("uncited-scan.pdf");
    expect(attachmentsSlice).toMatch(/<w:t[^>]*>\/<\/w:t>/);

    expect(xml).toContain("The URS was approved");
    expect(xml).toContain("IQ completed");
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).not.toContain("[1]");
    expect(xml).not.toContain("[2]");
    const perSectionCitations = xml.match(/Citations:/g) ?? [];
    expect(perSectionCitations).toHaveLength(0);
    expect(xml).toContain("1. [urs.pdf, p. 2]");
    expect(xml).toContain("2. [iq.pdf, p. 4]");
    expect(paragraphStyle(xml, "10.0 CITATIONS")).toBe("Heading1");
  });

  it("omits the unified bibliography and numbered markers when omitCitations is set", async () => {
    const buf = await generateReportDocx({
      report: elrReport(),
      sections: elrSections({
        elr_objective: {
          ...EMPTY_ELR_CONTENT.elr_objective,
          narrative: citedDoc("The URS was approved [1].", [
            "1. [urs.pdf, p. 2]",
          ]),
        },
      }),
      omitCitations: true,
      attachments: [],
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    expect(xml).toContain("The URS was approved");
    expect(xml).not.toContain("10.0 CITATIONS");
    expect(xml).not.toContain("[urs.pdf, p. 2]");
    expect(xml).not.toContain("[1]");
    expect(xml).not.toContain("Citations:");
  });
});
