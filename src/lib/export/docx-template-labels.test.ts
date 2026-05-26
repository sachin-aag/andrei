import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { reports } from "@/db/schema";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import { seedBlankReportSections } from "@/lib/reports/seed-blank-report-sections";
import { EMPTY_CONTENT, REPORT_SECTION_ROW_ORDER } from "@/types/sections";
import type { ReportSectionRecord } from "@/types/report";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "investigation-report-template.docx"
);

function labelRunXml(xml: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<w:r><w:rPr><w:b/>[\\s\\S]*?<\\/w:rPr><w:t[^>]*>\\s*${escaped}\\s*<\\/w:t><\\/w:r>`,
    "i"
  );
  return re.exec(xml)?.[0] ?? null;
}

describe("investigation-report-template.docx label formatting", () => {
  it("uses w:b on analyze section field labels", () => {
    const buf = fs.readFileSync(TEMPLATE_PATH);
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";

    for (const label of [
      "Brainstorming:",
      "Other Tool if Any:",
      "Measure:",
      "5 Why Approach (If Applicable):",
      "6 M Method (If Applicable):",
      "Man:",
      "System:",
      "Document:",
    ]) {
      expect(labelRunXml(xml, label), `expected bold run for ${label}`).toBeTruthy();
    }
  });

  it("preserves bold impact assessment labels after docxtemplater render", async () => {
    const reportId = "test-report-bold-labels";
    const analyze = {
      ...EMPTY_CONTENT.analyze,
      impactAssessment: {
        system: "The non-conformance related to failure of 2-point calibration.",
        document: "Performed the detail impact assessment for the reported nonconformance.",
        product: "",
        equipment: "",
        patientSafety: "",
      },
    };
    const sections: ReportSectionRecord[] = REPORT_SECTION_ROW_ORDER.map((section, i) => ({
      id: `sec-${section}-${i}`,
      reportId,
      section,
      content:
        section === "analyze"
          ? analyze
          : EMPTY_CONTENT[section as keyof typeof EMPTY_CONTENT],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const report: typeof reports.$inferSelect = {
      id: reportId,
      deviationNo: "DEV/TEST/01",
      date: new Date("2026-04-08"),
      authorId: "user-1",
      assignedManagerId: null,
      otherTools: "",
      toolsUsed: { sixM: true, fiveWhy: false, brainstorming: false },
      status: "draft" as const,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const buf = await generateReportDocx({ report, sections });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";

    for (const label of ["System:", "Document:"]) {
      expect(labelRunXml(xml, label), `expected bold run for ${label} after export`).toBeTruthy();
    }
    expect(xml).toContain("2-point calibration");
    expect(xml).toContain("detail impact assessment");
  });

  it("places improve and control checkpoints in the row above corrective/preventive action", async () => {
    const reportId = "test-report-improve-control-rows";
    const seeded = seedBlankReportSections();
    const iso = new Date("2026-03-04T12:00:00.000Z");
    const report: typeof reports.$inferSelect = {
      id: reportId,
      deviationNo: "DEV/TEST/ROWS",
      date: iso,
      toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
      otherTools: "",
      status: "draft",
      authorId: "1",
      assignedManagerId: null,
      createdAt: iso,
      updatedAt: iso,
    };
    const sections: ReportSectionRecord[] = REPORT_SECTION_ROW_ORDER.map((section, i) => ({
      id: `sec-${section}-${i}`,
      reportId,
      section,
      content: seeded[section as keyof typeof seeded],
      updatedAt: iso.toISOString(),
    }));

    const buf = await generateReportDocx({ report, sections });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    const rowTexts: string[] = [];
    const rowRe = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
    let m;
    while ((m = rowRe.exec(xml)) !== null) {
      const texts: string[] = [];
      const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let tm;
      while ((tm = tRe.exec(m[0])) !== null) texts.push(tm[1]);
      rowTexts.push(texts.join("").replace(/\s+/g, " ").trim());
    }

    const improveRow = rowTexts.find((t) => /^Improve:/i.test(t));
    const correctiveRow = rowTexts.find((t) => /^Corrective Action:/i.test(t));
    const controlRow = rowTexts.find((t) => /^Control:/i.test(t));
    const preventiveRow = rowTexts.find((t) => /^Preventive Action:/i.test(t));

    expect(improveRow).toContain("Improve section covers the corrective actions");
    expect(improveRow).toMatch(
      /Are the identified corrective actions achievable based on the information provided/i
    );
    expect(correctiveRow).not.toContain("Improve section covers the corrective actions");
    expect(controlRow).toContain("Control section covers the preventive actions");
    expect(controlRow).toMatch(
      /Are the identified preventive actions achievable based on the information provided/i
    );
    expect(preventiveRow).not.toContain("Control section covers the preventive actions");
  });

  it("preserves bold impact labels when exporting an imported sample report", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "docs",
      "sample_files",
      "Investigation DEV-QC-25-002.docx"
    );
    const imported = await docxBufferToImportedReportContent(fs.readFileSync(fixturePath));
    const reportId = "test-report-qc-import-export";
    const iso = new Date("2026-03-04T12:00:00.000Z");
    const report: typeof reports.$inferSelect = {
      id: reportId,
      deviationNo: "DEV-QC-25-002",
      date: iso,
      toolsUsed: imported.toolsUsed,
      otherTools: "",
      status: "draft",
      authorId: "1",
      assignedManagerId: "5",
      createdAt: iso,
      updatedAt: iso,
    };
    const sections: ReportSectionRecord[] = REPORT_SECTION_ROW_ORDER.map((section, i) => ({
      id: `sec-${section}-${i}`,
      reportId,
      section,
      content: imported.sections[section],
      updatedAt: iso.toISOString(),
    }));

    const buf = await generateReportDocx({ report, sections });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";

    for (const label of ["System:", "Document:", "Product:", "Equipment:"]) {
      expect(labelRunXml(xml, label), `expected bold run for ${label} in QC export`).toBeTruthy();
    }
  });
});
