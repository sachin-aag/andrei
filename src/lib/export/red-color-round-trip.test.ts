import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { REPORT_SECTION_ROW_ORDER } from "@/types/sections";
import type { ReportSectionRecord } from "@/types/report";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

vi.mock("@/lib/import/extract-math-from-image", () => ({
  extractMathFromImage: vi.fn(async () => null),
}));

const FIXTURE = path.join(
  process.cwd(),
  "docs",
  "Draft Investigation (DEV-QC-26-001).docx"
);

function countColoredNodes(doc: JSONContent | undefined): number {
  let c = 0;
  if (!doc) return 0;
  if (doc.type === "text" && doc.marks?.some((m) => m.type === "textStyle")) c++;
  for (const ch of doc.content ?? []) c += countColoredNodes(ch);
  return c;
}

function countRedInOoxml(xml: string): number {
  return [...xml.matchAll(/<w:color w:val="(EE0000|FF0000|C00000)"/gi)].length;
}

describe("red color round-trip (DEV-QC-26-001 draft)", () => {
  it("preserves red text through import and export", async () => {
    const buf = fs.readFileSync(FIXTURE);
    const imported = await docxBufferToImportedReportContent(buf);

    const investigationOutcome = imported.sections.analyze.investigationOutcome;
    const rootCause = imported.sections.analyze.rootCause.narrative;

    expect(richJsonToPlainText(investigationOutcome)).toContain("Refer Attachment No. XII");
    expect(richJsonToPlainText(rootCause)).toContain("Primary Root Cause Level 1");
    expect(countColoredNodes(investigationOutcome)).toBeGreaterThan(0);
    expect(countColoredNodes(rootCause)).toBeGreaterThan(0);

    const iso = new Date("2026-03-04T12:00:00.000Z");
    const report = {
      id: "test",
      deviationNo: "DEV-QC-26-001",
      date: iso,
      toolsUsed: imported.toolsUsed,
      otherTools: "",
      status: "draft" as const,
      authorId: "1",
      assignedManagerId: "5",
      reviewedById: null,
      deletedAt: null,
      deletedById: null,
      createdAt: iso,
      updatedAt: iso,
    };
    const sections: ReportSectionRecord[] = REPORT_SECTION_ROW_ORDER.map((section, i) => ({
      id: `s-${i}`,
      reportId: "test",
      section,
      content: imported.sections[section],
      updatedAt: iso.toISOString(),
    }));

    const exported = await generateReportDocx({ report, sections });
    const exportXml = new PizZip(exported).file("word/document.xml")?.asText() ?? "";

    expect(countRedInOoxml(exportXml)).toBeGreaterThan(0);
    expect(exportXml).toContain("Refer Attachment No. XII");
    expect(exportXml).toMatch(/w:color w:val="EE0000"/);
    expect(exportXml).toContain("Primary Root Cause Level 1");
  }, 20_000);
});
