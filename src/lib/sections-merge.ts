import { collapseImpactAssessment } from "@/lib/analyze-impact-assessment";
import { collapseFiveWhyFields, normalizeFiveWhyNarrative } from "@/lib/analyze-five-why";
import { collapseRootCauseFields } from "@/lib/analyze-root-cause";
import type {
  AnalyzeSection,
  AttachmentsSection,
  ControlSection,
  ConclusionSection,
  DefineSection,
  DocumentsReviewedSection,
  ImproveSection,
  MeasureSection,
  SignatureApprovalsSection,
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT } from "@/types/sections";
import { stringFieldFromStoredValue } from "@/lib/section-content-normalize";
import type { JSONContent } from "@tiptap/core";
import {
  appendParagraphsToDoc,
  emptyDoc,
  legacyStringToDoc,
  normalizeRichField,
  richJsonToPlainText,
} from "@/lib/tiptap/rich-text";
import type { SectionType } from "@/db/schema";

export function mergeDefineSection(content: unknown): DefineSection {
  const base = EMPTY_CONTENT.define;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<DefineSection>;
  return {
    ...base,
    ...o,
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
}

export function mergeMeasureSection(content: unknown): MeasureSection {
  const base = EMPTY_CONTENT.measure;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<MeasureSection>;
  const { regulatoryNotification, ...rest } = o;
  const narrative = normalizeRichField(o.narrative ?? base.narrative);
  const notificationText =
    typeof regulatoryNotification === "string" ? regulatoryNotification.trim() : "";
  const mergedNarrative =
    notificationText && !richJsonToPlainText(narrative).includes(notificationText)
      ? appendParagraphsToDoc(
          narrative,
          `Regulatory Notification: ${notificationText}`
        )
      : narrative;

  return {
    ...base,
    ...rest,
    narrative: mergedNarrative,
    experimentNumber:
      typeof o.experimentNumber === "string" ? o.experimentNumber : base.experimentNumber,
    experimentTitle:
      typeof o.experimentTitle === "string" ? o.experimentTitle : base.experimentTitle,
    purpose: normalizeRichField(o.purpose ?? base.purpose),
    conclusion: normalizeRichField(o.conclusion ?? base.conclusion),
  };
}

export function mergeConclusionSection(content: unknown): ConclusionSection {
  const base = EMPTY_CONTENT.conclusion;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<ConclusionSection>;
  return {
    ...base,
    ...o,
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
}

export function mergeImproveSection(content: unknown): ImproveSection {
  const base = EMPTY_CONTENT.improve;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<ImproveSection> & {
    correctiveActions?: unknown;
  };

  const narrative = normalizeRichField(o.narrative ?? base.narrative);
  let corrective = coerceCorrectiveActions(
    o.correctiveActions,
    base.correctiveActions
  );
  const narPlain = richJsonToPlainText(narrative).trim();

  if (narPlain) {
    const corPlain = richJsonToPlainText(corrective).trim();
    if (!corPlain) corrective = narrative;
    else if (!corPlain.startsWith(narPlain) && !narPlain.startsWith(corPlain)) {
      corrective = legacyStringToDoc(`${narPlain}\n\n${corPlain}`);
    }
  }

  return {
    ...base,
    narrative: emptyDoc(),
    correctiveActions: corrective,
  };
}

function coerceStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v : ""))
    .map((s) => s.trim())
    .filter(Boolean);
}

function coerceAttachmentItems(
  value: unknown
): AttachmentsSection["items"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const o = entry as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      const description =
        typeof o.description === "string" ? o.description.trim() : "";
      if (!label && !description) return null;
      return { label, description };
    })
    .filter((x): x is AttachmentsSection["items"][number] => x !== null);
}

export function mergeDocumentsReviewedSection(
  content: unknown
): DocumentsReviewedSection {
  const base = EMPTY_CONTENT.documents_reviewed;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<DocumentsReviewedSection>;
  return { items: coerceStringList(o.items ?? []) };
}

export function mergeAttachmentsSection(content: unknown): AttachmentsSection {
  const base = EMPTY_CONTENT.attachments;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<AttachmentsSection>;
  return { items: coerceAttachmentItems(o.items ?? []) };
}

export function mergeControlSection(content: unknown): ControlSection {
  const base = EMPTY_CONTENT.control;
  if (!content || typeof content !== "object") return base;
  const o = content as Record<string, unknown> & { preventiveActions?: unknown };
  const narrative = normalizeRichField("narrative" in o ? o.narrative : emptyDoc());
  let preventive = coercePreventiveActions(
    o.preventiveActions,
    base.preventiveActions
  );
  const narPlain = richJsonToPlainText(narrative).trim();

  if (narPlain) {
    const pPlain = richJsonToPlainText(preventive).trim();
    if (!pPlain) preventive = narrative;
    else if (!pPlain.startsWith(narPlain) && !narPlain.startsWith(pPlain)) {
      preventive = legacyStringToDoc(`${narPlain}\n\n${pPlain}`);
    }
  }

  return {
    preventiveActions: preventive,
  };
}

export function mergeAnalyzeSection(content: unknown): AnalyzeSection {
  const base = EMPTY_CONTENT.analyze;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<AnalyzeSection> & {
    fiveWhy?: Partial<AnalyzeSection["fiveWhy"]> & {
      whys?: Array<{ question?: unknown; answer?: unknown }>;
    };
  };
  const impactAssessment = collapseImpactAssessment(
    "impactAssessment" in o ? o.impactAssessment : base.impactAssessment
  );
  const rest = { ...(o as Partial<AnalyzeSection>) };
  delete (rest as Partial<AnalyzeSection> & { impactAssessment?: unknown })
    .impactAssessment;
  const merged = deepMerge(base, rest);
  const fiveWhyInput = o.fiveWhy;
  let narrative = merged.fiveWhy.narrative;
  if (fiveWhyInput && "narrative" in fiveWhyInput) {
    narrative = normalizeFiveWhyNarrative(fiveWhyInput.narrative);
  } else {
    narrative = coerceFiveWhyRows(
      (fiveWhyInput as { whys?: Array<{ question?: unknown; answer?: unknown }> } | undefined)
        ?.whys,
      narrative
    );
  }
  const conclusion =
    typeof o.fiveWhy?.conclusion === "string"
      ? o.fiveWhy.conclusion
      : merged.fiveWhy.conclusion;

  return {
    ...merged,
    fiveWhy: collapseFiveWhyFields({ narrative, conclusion }),
    investigationOutcome: normalizeRichField(
      "investigationOutcome" in o ? o.investigationOutcome : merged.investigationOutcome
    ),
    rootCause: collapseRootCauseFields(
      merged.rootCause as Parameters<typeof collapseRootCauseFields>[0]
    ),
    impactAssessment,
  };
}

/* Legacy rows stored preventiveActions as a structured array; flatten to rich doc. */
function coercePreventiveActions(
  value: unknown,
  fallback: JSONContent
): JSONContent {
  if (typeof value === "string") return legacyStringToDoc(value);
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as JSONContent).type === "doc"
  ) {
    return normalizeRichField(value);
  }
  if (Array.isArray(value)) {
    const plain = value
      .map((entry, idx) => {
        if (!entry || typeof entry !== "object") return "";
        const a = entry as Record<string, unknown>;
        const lines = [
          `PA-${String(idx + 1).padStart(3, "0")}`,
          a.description ? `Description: ${String(a.description)}` : "",
          a.linkedRootCause ? `Linked root cause: ${String(a.linkedRootCause)}` : "",
          a.responsiblePerson ? `Responsible: ${String(a.responsiblePerson)}` : "",
          a.dueDate ? `Due date: ${String(a.dueDate)}` : "",
          a.expectedOutcome ? `Expected outcome: ${String(a.expectedOutcome)}` : "",
          a.effectivenessVerification
            ? `Effectiveness verification: ${String(a.effectivenessVerification)}`
            : "",
        ].filter(Boolean);
        return lines.join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
    return legacyStringToDoc(plain);
  }
  return fallback;
}

/* Legacy rows stored correctiveActions as structured cards; flatten to rich doc. */
function coerceCorrectiveActions(
  value: unknown,
  fallback: JSONContent
): JSONContent {
  if (typeof value === "string") return legacyStringToDoc(value);
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as JSONContent).type === "doc"
  ) {
    return normalizeRichField(value);
  }
  if (Array.isArray(value)) {
    const plain = value
      .map((entry, idx) => {
        if (!entry || typeof entry !== "object") return "";
        const a = entry as Record<string, unknown>;
        const lines = [
          `CA-${String(idx + 1).padStart(3, "0")}`,
          a.description ? `Description: ${String(a.description)}` : "",
          a.responsiblePerson ? `Responsible: ${String(a.responsiblePerson)}` : "",
          a.dueDate ? `Due date: ${String(a.dueDate)}` : "",
          a.expectedOutcome ? `Expected outcome: ${String(a.expectedOutcome)}` : "",
          a.effectivenessVerification
            ? `Effectiveness verification: ${String(a.effectivenessVerification)}`
            : "",
        ].filter(Boolean);
        return lines.join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
    return legacyStringToDoc(plain);
  }
  return fallback;
}

/* Legacy rows stored 5-Why as question/answer pairs; flatten to the new narrative field. */
function coerceFiveWhyRows(
  value: Array<{ question?: unknown; answer?: unknown }> | undefined,
  fallback: AnalyzeSection["fiveWhy"]["narrative"]
): AnalyzeSection["fiveWhy"]["narrative"] {
  if (!Array.isArray(value)) return fallback;
  return normalizeFiveWhyNarrative(value
    .map((entry, idx) => {
      const question = typeof entry.question === "string" ? entry.question.trim() : "";
      const answer = typeof entry.answer === "string" ? entry.answer.trim() : "";
      return [
        question ? `${idx + 1}. Why: ${question}` : "",
        answer ? `Ans. ${answer}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n"));
}

export function mergeSignatureApprovalsSection(content: unknown): SignatureApprovalsSection {
  const base = EMPTY_CONTENT.signature_approvals;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<SignatureApprovalsSection>;
  const table =
    o.table && typeof o.table === "object" && o.table.type === "table"
      ? o.table
      : base.table;
  const headerRowXml =
    typeof o.headerRowXml === "string" && o.headerRowXml.trim()
      ? o.headerRowXml
      : undefined;
  const dataRowXml =
    typeof o.dataRowXml === "string" && o.dataRowXml.trim() ? o.dataRowXml : undefined;
  return { table, headerRowXml, dataRowXml };
}

export function mergeSection<K extends keyof SectionContentMap & SectionType>(
  section: K,
  content: unknown
): SectionContentMap[K] {
  switch (section) {
    case "define":
      return mergeDefineSection(content) as SectionContentMap[K];
    case "measure":
      return mergeMeasureSection(content) as SectionContentMap[K];
    case "analyze":
      return mergeAnalyzeSection(content) as SectionContentMap[K];
    case "improve":
      return mergeImproveSection(content) as SectionContentMap[K];
    case "control":
      return mergeControlSection(content) as SectionContentMap[K];
    case "conclusion":
      return mergeConclusionSection(content) as SectionContentMap[K];
    case "documents_reviewed":
      return mergeDocumentsReviewedSection(content) as SectionContentMap[K];
    case "attachments":
      return mergeAttachmentsSection(content) as SectionContentMap[K];
    case "signature_approvals":
      return mergeSignatureApprovalsSection(content) as SectionContentMap[K];
    default:
      return mergeGeneric(section, content);
  }
}

function mergeGeneric<K extends keyof SectionContentMap>(
  section: K,
  content: unknown
): SectionContentMap[K] {
  const base = EMPTY_CONTENT[section] as SectionContentMap[K];
  if (!content || typeof content !== "object") return base;
  return deepMerge(base, content as Partial<SectionContentMap[K]>);
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  if (Array.isArray(base)) {
    return (Array.isArray(override) ? override : base) as T;
  }
  if (typeof base !== "object" || base === null) {
    return (override ?? base) as T;
  }
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries((override as Record<string, unknown>) ?? {})) {
    const baseVal = out[k];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      out[k] = deepMerge(baseVal as unknown, v as Partial<unknown>);
    } else if (typeof baseVal === "string" && v !== null && typeof v === "object") {
      /* Rich-text doc in DB; legacy shape expects a string (avoid `[object Object]`). */
      out[k] = stringFieldFromStoredValue(v) as (typeof out)[typeof k];
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
