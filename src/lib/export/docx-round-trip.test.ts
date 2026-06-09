import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { reports } from "@/db/schema";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { mergeSection } from "@/lib/sections-merge";
import type {
  AnalyzeSection,
  AttachmentsSection,
  ControlSection,
  DefineSection,
  DocumentsReviewedSection,
  ImproveSection,
  MeasureSection,
} from "@/types/sections";
import { REPORT_SECTION_ROW_ORDER } from "@/types/sections";
import type { ReportSectionRecord } from "@/types/report";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

/**
 * Integration-ish test: mimics multipart upload parsing + DOCX export (same code paths as
 * `docxBufferToImportedReportContent` → DB-shaped rows → `generateReportDocx`), then compares
 * a normalized fingerprint instead of binary .docx equality (different compression/metadata).
 */

type ReportRow = typeof reports.$inferSelect;

/** Same wording as DOCX export `na()` — re-import captures this literal for empty slots. */
function normalizeComparableText(s: string): string {
  const t = s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (
    !t ||
    t === "Not Applicable" ||
    t === "\u2014" ||
    t === "-" ||
    t === "NA"
  ) {
    return "";
  }
  return t;
}

/** Mammoth/export often inserts or drops spaces (e.g. before `Ans.`); strip all ASCII whitespace so round-trip fingerprints stay stable. */
function fingerprintComparableString(s: string): string {
  const n = normalizeComparableText(s);
  let fp = n.replace(/\s/g, "");
  // Word list export/re-import may add visible ordinals like "1.HMI" (not "010.The").
  fp = fp.replace(/(?<![0-9])([1-9]\d?)\.(?=[A-Z])/g, "");
  return fp;
}

function stripTrailingRoundTripResidue(fp: string): string {
  for (let i = 0; i < 4; i++) {
    const next = fp
      .replace(/NotApplicable$/i, "")
      .replace(/Conclusion:?$/i, "");
    if (next === fp) break;
    fp = next;
  }
  return fp;
}

function fingerprintFiveWhyNarrative(s: string): string {
  // The 5-Why block is one verbatim field. Source DOCXs may repeat a "Conclusion:" label or
  // older exports appended "Not Applicable". Strip trailing residue so fingerprints match on
  // substantive text only.
  const fp = fingerprintComparableString(s).replace(/\d+\.(?=Why)/gi, "");
  return stripTrailingRoundTripResidue(fp);
}

function mergedEditableSections(sections: ImportedReportContent["sections"]) {
  return {
    define: mergeSection("define", sections.define),
    measure: mergeSection("measure", sections.measure),
    analyze: mergeSection("analyze", sections.analyze),
    improve: mergeSection("improve", sections.improve),
    control: mergeSection("control", sections.control),
    documents_reviewed: mergeSection("documents_reviewed", sections.documents_reviewed),
    attachments: mergeSection("attachments", sections.attachments),
  };
}

function fingerprintDefine(d: DefineSection) {
  return fingerprintComparableString(richJsonToPlainText(d.narrative));
}

function fingerprintMeasure(m: MeasureSection) {
  const narrative = fingerprintComparableString(richJsonToPlainText(m.narrative));
  const reg =
    typeof m.regulatoryNotification === "string"
      ? fingerprintComparableString(m.regulatoryNotification)
      : "";
  return { narrative, regulatoryNotification: reg };
}

function fingerprintAnalyze(a: AnalyzeSection): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.sixM)) {
    out[`sixM.${k}`] = fingerprintComparableString(v);
  }
  out["fiveWhy.narrative"] = fingerprintFiveWhyNarrative(
    richJsonToPlainText(a.fiveWhy.narrative)
  );
  out["fiveWhy.conclusion"] = fingerprintComparableString(a.fiveWhy.conclusion);
  out["brainstorming"] = fingerprintComparableString(a.brainstorming);
  out["otherTools"] = fingerprintComparableString(a.otherTools);
  out["investigationOutcome"] = fingerprintComparableString(
    richJsonToPlainText(a.investigationOutcome)
  );
  for (const [k, v] of Object.entries(a.rootCause)) {
    out[`rootCause.${k}`] = fingerprintComparableString(
      richJsonToPlainText(v as JSONContent)
    );
  }
  out["impactAssessment"] = fingerprintComparableString(
    richJsonToPlainText(a.impactAssessment)
  );
  return out;
}

function fingerprintImprove(i: ImproveSection) {
  return {
    narrative: fingerprintComparableString(richJsonToPlainText(i.narrative)),
    correctiveActions: stripTrailingRoundTripResidue(
      fingerprintComparableString(richJsonToPlainText(i.correctiveActions))
    ),
  };
}

function fingerprintControl(c: ControlSection) {
  return {
    preventiveActions: stripTrailingRoundTripResidue(
      fingerprintComparableString(richJsonToPlainText(c.preventiveActions))
    ),
  };
}

function fingerprintDocumentsReviewed(dr: DocumentsReviewedSection) {
  return {
    items: dr.items.map((s) => fingerprintComparableString(s)),
  };
}

function fingerprintAttachments(att: AttachmentsSection) {
  return {
    items: att.items.map((i) => ({
      label: fingerprintComparableString(i.label),
      description: fingerprintComparableString(i.description),
    })),
  };
}

/** Structured summary used to diff import → export → re-import without binary DOCX equality. */
function fingerprintAfterMerge(sections: ImportedReportContent["sections"]) {
  const m = mergedEditableSections(sections);
  return {
    define: fingerprintDefine(m.define),
    measure: fingerprintMeasure(m.measure),
    analyze: fingerprintAnalyze(m.analyze),
    improve: fingerprintImprove(m.improve),
    control: fingerprintControl(m.control),
    documents_reviewed: fingerprintDocumentsReviewed(m.documents_reviewed),
    attachments: fingerprintAttachments(m.attachments),
  };
}

function buildMockReport(imported: ImportedReportContent): ReportRow {
  const iso = new Date("2026-03-04T12:00:00.000Z");
  return {
    id: "docx-round-trip-report-id",
    deviationNo: "DEV-PK-25-002",
    date: iso,
    toolsUsed: imported.toolsUsed,
    otherTools: "",
    status: "draft",
    authorId: "1",
    assignedManagerId: "5",
    createdAt: iso,
    updatedAt: iso,
  };
}

function buildEditableSectionRecords(
  reportId: string,
  sections: ImportedReportContent["sections"]
): ReportSectionRecord[] {
  const updatedAt = "2026-01-01T00:00:00.000Z";
  return REPORT_SECTION_ROW_ORDER.map((section, i) => ({
    id: `test-section-${section}-${i}`,
    reportId,
    section,
    content: sections[section],
    updatedAt,
  }));
}

describe("DOCX upload → export round-trip", () => {
  const fixturePath = path.join(
    process.cwd(),
    "docs",
    "sample_files",
    "Investigation  DEV-PK-25-002.docx"
  );

  it("exported DOCX re-import matches original import (normalized section payloads)", async () => {
    const uploaded = await docxBufferToImportedReportContent(fs.readFileSync(fixturePath));

    const reportRow = buildMockReport(uploaded);
    const sectionsInput = buildEditableSectionRecords(reportRow.id, uploaded.sections);
    const exportedBuffer = await generateReportDocx({ report: reportRow, sections: sectionsInput });

    const afterExport = await docxBufferToImportedReportContent(exportedBuffer);

    expect(afterExport.toolsUsed).toEqual(uploaded.toolsUsed);

    const beforeFp = fingerprintAfterMerge(uploaded.sections);
    const afterFp = fingerprintAfterMerge(afterExport.sections);

    expect(beforeFp).toEqual(afterFp);
    /** Sanity: define body survives templated export */
    expect(beforeFp.define.length).toBeGreaterThan(50);
  });
});
