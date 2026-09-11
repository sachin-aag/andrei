import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/react";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { reports } from "@/db/schema";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { docxParagraphPlainText } from "@/lib/export/docx-toc-headings";
import {
  ELR_DEFAULT_METADATA,
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
});
