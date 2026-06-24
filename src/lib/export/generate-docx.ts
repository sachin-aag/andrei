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
import { getUser } from "@/lib/auth/user-directory";
import { formatCalendarDate } from "@/lib/utils";
import { collapseFiveWhyFields } from "@/lib/analyze-five-why";
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
import { improveControlCheckpointsToDocxXml } from "@/lib/export/improve-control-checkpoints-docx";
import {
  legacyStringToDoc,
  normalizeRichField,
  richJsonToPlainText,
} from "@/lib/tiptap/rich-text";
import {
  splitControlUnifiedRichDoc,
  splitImproveUnifiedRichDoc,
} from "@/lib/improve-control-body-split";
import {
  applySignatureBlockToDocxZip,
  type SignatureBlockSnapshot,
} from "@/lib/docx/signature-block";
import type { SignatureApprovalsSection } from "@/types/sections";
import {
  applyElectronicSignaturesToDocxZip,
  type DocxAuditSignature,
} from "@/lib/export/electronic-signatures-docx";
import type { SectionType } from "@/db/schema";
import {
  applyWordCommentsToDocxZip,
  attachCommentsToFirstParagraph,
  type ReportDocxComment,
} from "@/lib/export/docx-comments";
import { applyGoogleDocsImageCompat } from "@/lib/export/docx-google-docs-images";

type ReportRow = typeof reportsTable.$inferSelect;
type ReportRowWithManagers = ReportRow & { assignedManagerIds?: string[] };

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

function rootCommentsFor(
  comments: ReportDocxComment[],
  section: SectionType,
  contentPath?: string | null
): ReportDocxComment[] {
  return comments.filter(
    (comment) =>
      !comment.parentId &&
      comment.status !== "dismissed" &&
      comment.section === section &&
      (contentPath ? comment.contentPath === contentPath : !comment.contentPath)
  );
}

function repliesFor(
  comments: ReportDocxComment[],
  parentId: string
): ReportDocxComment[] {
  return comments.filter(
    (comment) => comment.parentId === parentId && comment.status !== "dismissed"
  );
}

function normalizedAnchorText(comment: ReportDocxComment): string {
  return comment.anchorText.trim().replace(/\s+/g, " ");
}

function withWordComments(
  xml: string,
  ctx: DocxExportContext,
  comments: ReportDocxComment[],
  section: SectionType,
  contentPath?: string | null
): string {
  const roots = rootCommentsFor(comments, section, contentPath).toSorted(
    (a, b) => normalizedAnchorText(b).length - normalizedAnchorText(a).length
  );

  return roots.reduce(
    (currentXml, root) =>
      attachCommentsToFirstParagraph(
        currentXml,
        ctx,
        root,
        repliesFor(comments, root.id)
      ),
    xml
  );
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
  report: ReportRowWithManagers,
  sections: ReportSectionRecord[],
  ctx: DocxExportContext,
  comments: ReportDocxComment[]
): Record<string, unknown> {
  const d = sectionByKey(sections, "define") as DefineSection;
  const m = sectionByKey(sections, "measure") as MeasureSection;
  const a = sectionByKey(sections, "analyze") as AnalyzeSection;
  const i = sectionByKey(sections, "improve") as ImproveSection;
  const c = sectionByKey(sections, "control") as ControlSection;

  let improveDoc = normalizeRichField(i.correctiveActions);
  const improveNarrPlain = richJsonToPlainText(i.narrative).trim();
  if (improveNarrPlain) {
    const corPlain = richJsonToPlainText(improveDoc).trim();
    if (!corPlain) improveDoc = i.narrative;
    else if (!corPlain.startsWith(improveNarrPlain) && !improveNarrPlain.startsWith(corPlain)) {
      improveDoc = legacyStringToDoc(`${improveNarrPlain}\n\n${corPlain}`);
    }
  }
  const { checkpoints: improveCheckpoints, correctiveActionDoc } =
    splitImproveUnifiedRichDoc(improveDoc);
  const { checkpoints: controlCheckpoints, preventiveActionDoc } =
    splitControlUnifiedRichDoc(normalizeRichField(c.preventiveActions));
  const dr = sectionByKey(sections, "documents_reviewed") as DocumentsReviewedSection;
  const att = sectionByKey(sections, "attachments") as AttachmentsSection;
  const sig = sectionByKey(sections, "signature_approvals") as SignatureApprovalsSection;

  const author = getUser(report.authorId);
  const assignedManagerIds =
    (report.assignedManagerIds?.length ?? 0) > 0
      ? report.assignedManagerIds ?? []
      : report.assignedManagerId
        ? [report.assignedManagerId]
        : [];
  const managerNames = assignedManagerIds
    .map((id) => getUser(id)?.name)
    .filter((name): name is string => Boolean(name));

  return {
    // Header row
    date: formatCalendarDate(report.date),
    deviationNo: report.deviationNo,

    // Investigation-tool checkboxes are Word form fields in the template (see docx-form-checkbox)
    otherToolsDisplay: na(report.otherTools),

    // Define — compose all sub-fields into one block (raw XML for table support)
    defineNarrativeXml: withWordComments(
      withWordComments(
        narrativeToDocxXmlWithContext(d.narrative, ctx).xml,
        ctx,
        comments,
        "define",
        "narrative"
      ),
      ctx,
      comments,
      "define"
    ),

    // Measure — include regulatory notification if present (raw XML for table support)
    measureNarrativeXml: withWordComments(
      withWordComments(composeMeasureXml(m, ctx), ctx, comments, "measure", "narrative"),
      ctx,
      comments,
      "measure"
    ),

    // Analyze - 6M
    sixMMan: na(a.sixM.man),
    sixMMachine: na(a.sixM.machine),
    sixMMeasurement: na(a.sixM.measurement),
    sixMMaterial: na(a.sixM.material),
    sixMMethod: na(a.sixM.method),
    sixMMilieu: na(a.sixM.milieu),
    sixMConclusion: na(a.sixM.conclusion),

    // Analyze - 5 Why (single rich field: chain + conclusion; see analyze-five-why / template)
    fiveWhyNarrativeXml: narrativeToDocxXmlWithContext(
      collapseFiveWhyFields(a.fiveWhy).narrative,
      ctx
    ).xml,

    // Analyze - other
    brainstormingXml: plainTextToDocxXml(a.brainstorming, ctx),
    analyzeOtherToolsXml: plainTextToDocxXml(a.otherTools, ctx),

    // Investigation Outcome
    investigationOutcomeXml: withWordComments(
      withWordComments(
        narrativeToDocxXmlWithContext(
          normalizeRichField(a.investigationOutcome),
          ctx
        ).xml,
        ctx,
        comments,
        "analyze",
        "investigationOutcome"
      ),
      ctx,
      comments,
      "analyze"
    ),

    // Root Cause
    rootCauseNarrativeXml: withWordComments(
      narrativeToDocxXmlWithContext(
        normalizeRichField(a.rootCause.narrative),
        ctx
      ).xml,
      ctx,
      comments,
      "analyze",
      "rootCause.narrative"
    ),

    // Impact Assessment (single block)
    impactAssessmentXml: withWordComments(
      withWordComments(
        narrativeToDocxXmlWithContext(
          normalizeRichField(a.impactAssessment),
          ctx
        ).xml,
        ctx,
        comments,
        "analyze",
        "impactAssessment"
      ),
      ctx,
      comments,
      "analyze"
    ),

    // Improve — checkpoints in Improve row; narrative in Corrective Action row
    improveNarrativeXml: improveControlCheckpointsToDocxXml(improveCheckpoints, "improve", ctx),
    correctiveActionsXml: withWordComments(
      withWordComments(
        narrativeToDocxXmlWithContext(correctiveActionDoc, ctx).xml,
        ctx,
        comments,
        "improve",
        "correctiveActions"
      ),
      ctx,
      comments,
      "improve"
    ),

    // Control — checkpoints in Control row; narrative in Preventive Action row
    controlNarrativeXml: improveControlCheckpointsToDocxXml(controlCheckpoints, "control", ctx),
    preventiveActionsXml: withWordComments(
      withWordComments(
        narrativeToDocxXmlWithContext(preventiveActionDoc, ctx).xml,
        ctx,
        comments,
        "control",
        "preventiveActions"
      ),
      ctx,
      comments,
      "control"
    ),
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

    // Signature (legacy placeholders; row XML applied after render when imported)
    authorName: author?.name ?? "",
    managerName: managerNames.join(", "),
    _signatureApprovals: sig,
  };
}

function signatureSnapshotFromSection(
  sig: SignatureApprovalsSection
): SignatureBlockSnapshot | null {
  if (
    typeof sig.headerRowXml === "string" &&
    sig.headerRowXml.trim() &&
    typeof sig.dataRowXml === "string" &&
    sig.dataRowXml.trim()
  ) {
    return {
      headerRowXml: sig.headerRowXml,
      dataRowXml: sig.dataRowXml,
      table: sig.table ?? { type: "table", content: [] },
    };
  }
  return null;
}

export async function generateReportDocx({
  report,
  sections,
  comments = [],
  electronicSignatures = [],
}: {
  report: ReportRowWithManagers;
  sections: ReportSectionRecord[];
  comments?: ReportDocxComment[];
  electronicSignatures?: DocxAuditSignature[];
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
  const data = buildTemplateData(report, sections, ctx, comments);
  const signatureSnapshot = signatureSnapshotFromSection(
    data._signatureApprovals as SignatureApprovalsSection
  );
  delete data._signatureApprovals;
  doc.render(data);
  applySignatureBlockToDocxZip(doc.getZip(), signatureSnapshot);
  applyElectronicSignaturesToDocxZip(doc.getZip(), electronicSignatures);
  applyInvestigationToolCheckboxes(doc.getZip(), report.toolsUsed);
  applyNumberingToDocxZip(doc.getZip(), ctx);
  applyInlineMediaToDocxZip(doc.getZip(), ctx);
  applyWordCommentsToDocxZip(doc.getZip(), ctx);
  await applyGoogleDocsImageCompat(doc.getZip());

  const buf = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return buf;
}
