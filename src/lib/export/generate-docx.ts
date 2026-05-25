import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type {
  AnalyzeSection,
  ControlSection,
  DefineSection,
  ImproveSection,
  MeasureSection,
  DocumentsReviewedSection,
  AttachmentsSection,
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT } from "@/types/sections";
import type { ReportSectionRecord } from "@/types/report";
import type { reports as reportsTable } from "@/db/schema";
import { getUser } from "@/lib/auth/mock-users";
import { formatDate } from "@/lib/utils";
import { fiveWhyTextForExport } from "@/lib/analyze-five-why";
import { mergeSection } from "@/lib/sections-merge";
import { applyInvestigationToolCheckboxes } from "@/lib/export/docx-form-checkbox";
import { applyInlineMediaToDocxZip } from "@/lib/export/docx-inline-media";
import {
  createDocxExportContext,
  type DocxExportContext,
} from "@/lib/export/docx-export-context";
import {
  applyNumberingToDocxZip,
  loadListNumberingBasesFromZip,
} from "@/lib/export/docx-numbering";
import { narrativeToDocxXmlWithContext, plainTextToDocxXml } from "@/lib/export/narrative-to-docx-xml";
import type { SectionType } from "@/db/schema";

type ReportRow = typeof reportsTable.$inferSelect;

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "investigation-report-template.docx"
);

function sectionByKey<K extends keyof SectionContentMap>(
  rows: ReportSectionRecord[],
  key: K
): SectionContentMap[K] {
  const row = rows.find((r) => r.section === key);
  if (!row) return EMPTY_CONTENT[key];
  return mergeSection(key as K & SectionType, row.content);
}

function na(value: string | undefined | null): string {
  return value?.trim() ? value : "Not Applicable";
}

function toRoman(n: number): string {
  const numerals: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  let remaining = n;
  for (const [val, sym] of numerals) {
    while (remaining >= val) {
      result += sym;
      remaining -= val;
    }
  }
  return result;
}

function composeMeasureXml(m: MeasureSection, ctx: DocxExportContext): string {
  const narrativeXml = narrativeToDocxXmlWithContext(m.narrative, ctx).xml;
  if (m.regulatoryNotification?.trim()) {
    const regXml = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Regulatory Notification: </w:t></w:r><w:r><w:t xml:space="preserve">${m.regulatoryNotification.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>`;
    return narrativeXml + regXml;
  }
  return narrativeXml;
}

function buildTemplateData(
  report: ReportRow,
  sections: ReportSectionRecord[],
  ctx: DocxExportContext
): Record<string, unknown> {
  const d = sectionByKey(sections, "define") as DefineSection;
  const m = sectionByKey(sections, "measure") as MeasureSection;
  const a = sectionByKey(sections, "analyze") as AnalyzeSection;
  const i = sectionByKey(sections, "improve") as ImproveSection;
  const c = sectionByKey(sections, "control") as ControlSection;
  const dr = sectionByKey(sections, "documents_reviewed") as DocumentsReviewedSection;
  const att = sectionByKey(sections, "attachments") as AttachmentsSection;

  const author = getUser(report.authorId);
  const manager = getUser(report.assignedManagerId ?? undefined);

  return {
    // Header row
    date: formatDate(report.date),
    deviationNo: report.deviationNo,

    // Investigation-tool checkboxes are Word form fields in the template (see docx-form-checkbox)
    otherToolsDisplay: na(report.otherTools),

    // Define — compose all sub-fields into one block (raw XML for table support)
    defineNarrativeXml: narrativeToDocxXmlWithContext(d.narrative, ctx).xml,

    // Measure — include regulatory notification if present (raw XML for table support)
    measureNarrativeXml: composeMeasureXml(m, ctx),

    // Analyze - 6M
    sixMMan: na(a.sixM.man),
    sixMMachine: na(a.sixM.machine),
    sixMMeasurement: na(a.sixM.measurement),
    sixMMaterial: na(a.sixM.material),
    sixMMethod: na(a.sixM.method),
    sixMMilieu: na(a.sixM.milieu),
    sixMConclusion: na(a.sixM.conclusion),

    // Analyze - 5 Why (single field: chain + conclusion; see analyze-five-why / template)
    fiveWhyNarrativeXml: plainTextToDocxXml(fiveWhyTextForExport(a.fiveWhy), ctx),

    // Analyze - other
    brainstormingXml: plainTextToDocxXml(a.brainstorming, ctx),
    analyzeOtherToolsXml: plainTextToDocxXml(a.otherTools, ctx),

    // Investigation Outcome
    investigationOutcomeXml: plainTextToDocxXml(a.investigationOutcome, ctx),

    // Root Cause
    rootCauseNarrativeXml: plainTextToDocxXml(a.rootCause.narrative, ctx),

    // Impact Assessment
    impactSystem: na(a.impactAssessment.system),
    impactDocument: na(a.impactAssessment.document),
    impactProduct: na(a.impactAssessment.product),
    impactEquipment: na(a.impactAssessment.equipment),
    impactPatientSafety: na(a.impactAssessment.patientSafety),

    // Improve (raw XML for table support)
    improveNarrativeXml: narrativeToDocxXmlWithContext(i.narrative, ctx).xml,
    correctiveActionsXml: plainTextToDocxXml(i.correctiveActions, ctx),

    // Control (raw XML for table support)
    controlNarrativeXml: "",
    preventiveActionsXml: plainTextToDocxXml(c.preventiveActions, ctx),
    interimPlan: "Not Applicable",
    finalComments: "Not Applicable",
    regulatoryImpact: "Not Applicable",
    productQuality: "Not Applicable",
    validation: "Not Applicable",
    stability: "Not Applicable",
    marketClinical: "Not Applicable",
    lotDisposition: "Not Applicable",
    controlConclusion: "Not Applicable",

    // Documents Reviewed
    documentsReviewedXml: plainTextToDocxXml(
      dr.items.length > 0 ? dr.items.map((item, idx) => `${idx + 1}. ${item}`).join("\n") : "",
      ctx
    ),

    // Attachments
    attachments: att.items.map((item, idx) => ({
      romanNumeral: toRoman(idx + 1),
      attachmentDescription: item.description || item.label,
    })),

    // Signature
    authorName: author?.name ?? "",
    managerName: manager?.name ?? "",
  };
}

export async function generateReportDocx({
  report,
  sections,
}: {
  report: ReportRow;
  sections: ReportSectionRecord[];
}): Promise<Buffer> {
  const templateContent = fs.readFileSync(TEMPLATE_PATH);
  const zip = new PizZip(templateContent);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });

  const numberingBases = loadListNumberingBasesFromZip(zip);
  const ctx = createDocxExportContext(numberingBases);
  const data = buildTemplateData(report, sections, ctx);
  doc.render(data);
  applyInvestigationToolCheckboxes(doc.getZip(), report.toolsUsed);
  applyNumberingToDocxZip(doc.getZip(), ctx);
  applyInlineMediaToDocxZip(doc.getZip(), ctx);

  const buf = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return buf;
}
