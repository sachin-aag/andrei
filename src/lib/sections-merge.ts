import { collapseFiveWhyFields } from "@/lib/analyze-five-why";
import { collapseRootCauseFields } from "@/lib/analyze-root-cause";
import type {
  AnalyzeSection,
  AttachmentsSection,
  ControlSection,
  DefineSection,
  DocumentsReviewedSection,
  ImproveSection,
  MeasureSection,
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT } from "@/types/sections";
import { stringFieldFromStoredValue } from "@/lib/section-content-normalize";
import {
  appendParagraphsToDoc,
  emptyDoc,
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
    const corTrim = corrective.trim();
    if (!corTrim) corrective = narPlain;
    else if (!corTrim.startsWith(narPlain) && !narPlain.startsWith(corTrim))
      corrective = `${narPlain}\n\n${corrective}`;
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
    const pTrim = preventive.trim();
    if (!pTrim) preventive = narPlain;
    else if (!pTrim.startsWith(narPlain) && !narPlain.startsWith(pTrim))
      preventive = `${narPlain}\n\n${preventive}`;
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
  const merged = deepMerge(base, o as Partial<AnalyzeSection>);
  const narrative =
    typeof o.fiveWhy?.narrative === "string"
      ? o.fiveWhy.narrative
      : coerceFiveWhyRows(o.fiveWhy?.whys, merged.fiveWhy.narrative);
  const conclusion =
    typeof o.fiveWhy?.conclusion === "string"
      ? o.fiveWhy.conclusion
      : merged.fiveWhy.conclusion;

  return {
    ...merged,
    fiveWhy: collapseFiveWhyFields({ narrative, conclusion }),
    rootCause: collapseRootCauseFields(
      merged.rootCause as Parameters<typeof collapseRootCauseFields>[0]
    ),
  };
}

/* Legacy rows stored preventiveActions as a structured array; flatten to text. */
function coercePreventiveActions(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
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
  }
  return fallback;
}

/* Legacy rows stored correctiveActions as structured cards; flatten to text. */
function coerceCorrectiveActions(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
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
  }
  return fallback;
}

/* Legacy rows stored 5-Why as question/answer pairs; flatten to the new narrative field. */
function coerceFiveWhyRows(
  value: Array<{ question?: unknown; answer?: unknown }> | undefined,
  fallback: string
): string {
  if (!Array.isArray(value)) return fallback;
  return value
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
    .join("\n\n");
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
    case "documents_reviewed":
      return mergeDocumentsReviewedSection(content) as SectionContentMap[K];
    case "attachments":
      return mergeAttachmentsSection(content) as SectionContentMap[K];
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
