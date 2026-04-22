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
import { mergeSection } from "@/lib/sections-merge";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
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

function composeDefine(d: DefineSection): string {
  const parts: string[] = [];
  const narrativeText = richJsonToPlainText(d.narrative);
  if (narrativeText.trim()) parts.push(narrativeText.trim());
  if (d.location?.trim()) parts.push(`Location: ${d.location.trim()}`);
  if (d.dateTimeOccurrence?.trim())
    parts.push(`Date/Time of Occurrence: ${d.dateTimeOccurrence.trim()}`);
  if (d.dateTimeDetection?.trim())
    parts.push(`Date/Time of Detection: ${d.dateTimeDetection.trim()}`);
  if (d.personnel?.trim())
    parts.push(`Personnel Involved: ${d.personnel.trim()}`);
  if (d.initialScope?.trim())
    parts.push(`Initial Scope: ${d.initialScope.trim()}`);
  return parts.length > 0 ? parts.join("\n") : "Not Applicable";
}

function composeMeasure(m: MeasureSection): string {
  const parts: string[] = [];
  const narrativeText = richJsonToPlainText(m.narrative);
  if (narrativeText.trim()) parts.push(narrativeText.trim());
  if (m.regulatoryNotification?.trim())
    parts.push(`Regulatory Notification: ${m.regulatoryNotification.trim()}`);
  return parts.length > 0 ? parts.join("\n") : "Not Applicable";
}

function buildTemplateData(
  report: ReportRow,
  sections: ReportSectionRecord[]
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

  const tools = report.toolsUsed;
  const check = (v: boolean) => (v ? "\u2611" : "\u2610");

  return {
    // Header row
    date: formatDate(report.date),
    deviationNo: report.deviationNo,

    // Tools used
    sixMCheck: check(tools.sixM),
    fiveWhyCheck: check(tools.fiveWhy),
    brainstormingCheck: check(tools.brainstorming),
    otherToolsDisplay: na(report.otherTools),

    // Define — compose all sub-fields into one block
    defineNarrative: composeDefine(d),

    // Measure — include regulatory notification if present
    measureNarrative: composeMeasure(m),

    // Analyze - 6M
    sixMMan: na(a.sixM.man),
    sixMMachine: na(a.sixM.machine),
    sixMMeasurement: na(a.sixM.measurement),
    sixMMaterial: na(a.sixM.material),
    sixMMethod: na(a.sixM.method),
    sixMMilieu: na(a.sixM.milieu),
    sixMConclusion: na(a.sixM.conclusion),

    // Analyze - 5 Why
    fiveWhys: a.fiveWhy.whys.map((w, idx) => ({
      index: idx + 1,
      question: na(w.question),
      answer: na(w.answer),
    })),
    fiveWhyConclusion: na(a.fiveWhy.conclusion),

    // Analyze - other
    brainstorming: na(a.brainstorming),
    analyzeOtherTools: na(a.otherTools),

    // Investigation Outcome
    investigationOutcome: na(a.investigationOutcome),

    // Root Cause
    rootCauseNarrative: na(a.rootCause.narrative),
    primaryLevel1: na(a.rootCause.primaryLevel1),
    secondaryLevel2: na(a.rootCause.secondaryLevel2),
    thirdLevel3: na(a.rootCause.thirdLevel3),

    // Impact Assessment
    impactSystem: na(a.impactAssessment.system),
    impactDocument: na(a.impactAssessment.document),
    impactProduct: na(a.impactAssessment.product),
    impactEquipment: na(a.impactAssessment.equipment),
    impactPatientSafety: na(a.impactAssessment.patientSafety),

    // Improve
    improveNarrative: na(richJsonToPlainText(i.narrative)),
    correctiveActions: i.correctiveActions.map((ca, idx) => ({
      caNumber: `CA-${String(idx + 1).padStart(3, "0")}`,
      description: na(ca.description),
      responsiblePerson: na(ca.responsiblePerson),
      dueDate: na(ca.dueDate),
      expectedOutcome: na(ca.expectedOutcome),
      effectivenessVerification: na(ca.effectivenessVerification),
    })),

    // Control
    controlNarrative: na(richJsonToPlainText(c.narrative)),
    preventiveActions: c.preventiveActions.map((pa, idx) => ({
      paNumber: `PA-${String(idx + 1).padStart(3, "0")}`,
      description: na(pa.description),
      linkedRootCause: na(pa.linkedRootCause),
      responsiblePerson: na(pa.responsiblePerson),
      dueDate: na(pa.dueDate),
      expectedOutcome: na(pa.expectedOutcome),
      effectivenessVerification: na(pa.effectivenessVerification),
    })),
    interimPlan: na(c.interimPlan),
    finalComments: na(c.finalComments),
    regulatoryImpact: na(c.regulatoryImpact),
    productQuality: na(c.productQuality),
    validation: na(c.validation),
    stability: na(c.stability),
    marketClinical: na(c.marketClinical),
    lotDisposition: na(c.lotDisposition),
    controlConclusion: na(c.conclusion),

    // Documents Reviewed
    documentsReviewed: dr.items.length > 0
      ? dr.items.join("\n")
      : "Not Applicable",

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

  const data = buildTemplateData(report, sections);
  doc.render(data);

  const buf = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return buf;
}
