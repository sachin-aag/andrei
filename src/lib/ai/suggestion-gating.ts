import type { SectionType, CriterionStatus, DocumentType } from "@/db/schema";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import {
  evaluationContentHash,
  type AllSectionsContent,
} from "@/lib/ai/evaluation-content-hash";
import {
  effectiveStatus,
  rowsForSection,
  type CriterionRow,
} from "@/lib/ai/criteria-view";
import { getCriteria, getDocumentType } from "@/lib/document-types";
import { shouldSkipSuggestForEvaluation } from "@/lib/placeholders/evaluation-policy";
import type { EditScope } from "@/lib/suggestions/locator";
import {
  parseTableOperation,
  type TableOperation,
} from "@/lib/suggestions/table-operation";

/** Validate an untrusted structural scope from persisted / model JSON. */
export function parseEditScope(raw: unknown): EditScope | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  if (
    s.kind === "cell" &&
    typeof s.row === "number" &&
    typeof s.col === "number" &&
    Number.isInteger(s.row) &&
    Number.isInteger(s.col) &&
    s.row >= 0 &&
    s.col >= 0
  ) {
    const scope: EditScope = { kind: "cell", row: s.row, col: s.col };
    if (typeof s.tableIndex === "number" && Number.isInteger(s.tableIndex)) {
      scope.tableIndex = s.tableIndex;
    }
    return scope;
  }
  if (
    s.kind === "listItem" &&
    typeof s.index === "number" &&
    Number.isInteger(s.index) &&
    s.index >= 0
  ) {
    const scope: EditScope = { kind: "listItem", index: s.index };
    if (typeof s.listIndex === "number" && Number.isInteger(s.listIndex)) {
      scope.listIndex = s.listIndex;
    }
    return scope;
  }
  return undefined;
}

const FAILING: CriterionStatus[] = ["not_met", "partially_met"];

export type SectionContentHashOptions = {
  documentType?: DocumentType;
  /** Required for criteria with dependsOn so freshness matches evaluate. */
  allSections?: AllSectionsContent;
};

/**
 * Content hash for evaluation freshness and suggestion staleness.
 * Must match `evaluationContentHash` written by the evaluate route.
 */
export function sectionContentHash(
  section: SectionType,
  content: unknown,
  opts?: SectionContentHashOptions
): string {
  const documentType = opts?.documentType ?? "investigation_report";
  return evaluationContentHash({
    section,
    content,
    allSections: opts?.allSections,
    criteria: getCriteria(documentType, section),
    promptVersion: getDocumentType(documentType).prompts.promptVersion,
  });
}

export function isFailingStatus(status: CriterionStatus): boolean {
  return FAILING.includes(status);
}

/** Failing criteria with no open ai_fix linked to their evaluation row. */
export function gapCriteriaForSection(
  section: SectionType,
  evaluations: EvaluationRecord[],
  comments: CommentRecord[],
  sectionContent: unknown,
  documentType: DocumentType = "investigation_report",
  allSections?: AllSectionsContent
): CriterionRow[] {
  const rows = rowsForSection(section, evaluations, documentType).filter(
    (r) => !r.isPlaceholder && isFailingStatus(effectiveStatus(r))
  );
  const openFixEvalIds = new Set(
    comments
      .filter((c) => c.kind === "ai_fix" && c.status === "open" && c.evaluationId)
      .map((c) => c.evaluationId as string)
  );
  const hash = sectionContentHash(section, sectionContent, {
    documentType,
    allSections,
  });
  const gap = rows.filter((r) => {
    if (r.evaluatedContentHash && r.evaluatedContentHash !== hash) return false;
    if (shouldSkipSuggestForEvaluation(r.reasoning)) return false;
    return !openFixEvalIds.has(r.id);
  });

  return sortGapCriteria(section, gap, documentType);
}

/** not_met (red) first, then partially_met (yellow), then criterion order. */
export function sortGapCriteria(
  section: SectionType,
  rows: CriterionRow[],
  documentType: DocumentType = "investigation_report"
): CriterionRow[] {
  return [...rows].sort((a, b) => {
    const priA = STATUS_PRIORITY[effectiveStatus(a)];
    const priB = STATUS_PRIORITY[effectiveStatus(b)];
    if (priA !== priB) return priA - priB;
    const orderA = criterionDisplayIndex(section, a.criterionKey, documentType);
    const orderB = criterionDisplayIndex(section, b.criterionKey, documentType);
    if (orderA !== orderB) return orderA - orderB;
    return a.criterionKey.localeCompare(b.criterionKey);
  });
}

export function canSuggestFixes(
  section: SectionType,
  evaluations: EvaluationRecord[],
  comments: CommentRecord[],
  sectionContent: unknown,
  opts?: {
    isEvaluating?: boolean;
    isSuggesting?: boolean;
    documentType?: DocumentType;
    allSections?: AllSectionsContent;
  }
): boolean {
  if (opts?.isEvaluating || opts?.isSuggesting) return false;
  return (
    gapCriteriaForSection(
      section,
      evaluations,
      comments,
      sectionContent,
      opts?.documentType ?? "investigation_report",
      opts?.allSections
    ).length > 0
  );
}

const STATUS_PRIORITY: Record<CriterionStatus, number> = {
  not_met: 0,
  partially_met: 1,
  met: 2,
  not_evaluated: 3,
};

export function criterionDisplayIndex(
  section: SectionType,
  criterionKey: string,
  documentType: DocumentType = "investigation_report"
): number {
  const defs = getCriteria(documentType, section);
  const idx = defs.findIndex((d) => d.key === criterionKey);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export type ParsedAiFixPayload = {
  deleteText: string;
  insertText: string;
  reasoning: string;
  /** Structural target (table cell / list item) for scoped edits. */
  scope?: EditScope;
  /** Structural table mutation from `edit_table` (not an anchored span). */
  tableOperation?: TableOperation;
  /** Present when persisted JSON had a tableOperation that failed to parse. */
  tableOperationInvalid?: boolean;
  /** Second apply site in the same field (citation at end of section). */
  second?: {
    anchorText: string;
    deleteText: string;
    insertText: string;
    scope?: EditScope;
  };
  /** Section content hash when this suggestion was created (staleness detection). */
  contentHashAtSuggestion?: string;
  evidenceSources?: Array<{
    citationId: string;
    attachmentId: string;
    filename: string;
    description?: string | null;
    pageNumber: number;
    chunkId: string;
    sourceKind: string;
    quote: string;
    ingestRunId: string;
  }>;
};

export function parseAiFixCommentContent(content: string): ParsedAiFixPayload {
  try {
    const parsed = JSON.parse(content) as Partial<ParsedAiFixPayload>;
    if (
      parsed &&
      typeof parsed === "object" &&
      ("insertText" in parsed || "tableOperation" in parsed)
    ) {
      const tableOperation =
        parsed.tableOperation !== undefined
          ? parseTableOperation(parsed.tableOperation)
          : undefined;
      return {
        deleteText: typeof parsed.deleteText === "string" ? parsed.deleteText : "",
        insertText: typeof parsed.insertText === "string" ? parsed.insertText : "",
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
        scope: parseEditScope(parsed.scope),
        tableOperation,
        tableOperationInvalid:
          parsed.tableOperation !== undefined && !tableOperation ? true : undefined,
        second: parseSecondEdit(parsed.second),
        contentHashAtSuggestion:
          typeof parsed.contentHashAtSuggestion === "string"
            ? parsed.contentHashAtSuggestion
            : undefined,
        evidenceSources: Array.isArray(parsed.evidenceSources)
          ? parsed.evidenceSources.flatMap((source) => {
              if (!source || typeof source !== "object") return [];
              const s = source as Record<string, unknown>;
              if (
                typeof s.citationId !== "string" ||
                typeof s.attachmentId !== "string" ||
                typeof s.filename !== "string" ||
                typeof s.pageNumber !== "number" ||
                typeof s.chunkId !== "string" ||
                typeof s.sourceKind !== "string" ||
                typeof s.quote !== "string" ||
                typeof s.ingestRunId !== "string"
              ) {
                return [];
              }
              return [
                {
                  citationId: s.citationId,
                  attachmentId: s.attachmentId,
                  filename: s.filename,
                  description:
                    typeof s.description === "string" ? s.description : null,
                  pageNumber: s.pageNumber,
                  chunkId: s.chunkId,
                  sourceKind: s.sourceKind,
                  quote: s.quote,
                  ingestRunId: s.ingestRunId,
                },
              ];
            })
          : undefined,
      };
    }
  } catch {
    // plain insert text
  }
  return { deleteText: "", insertText: content, reasoning: "" };
}

function parseSecondEdit(raw: unknown): ParsedAiFixPayload["second"] {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  const insertText = typeof s.insertText === "string" ? s.insertText : "";
  const deleteText = typeof s.deleteText === "string" ? s.deleteText : "";
  if (!deleteText.trim() && !insertText.trim()) return undefined;
  const scope = parseEditScope(s.scope);
  return {
    anchorText: typeof s.anchorText === "string" ? s.anchorText : "",
    deleteText,
    insertText,
    ...(scope ? { scope } : {}),
  };
}

export function serializeAiFixCommentContent(payload: ParsedAiFixPayload): string {
  return JSON.stringify(payload);
}

export type ParsedAiRedraftPayload = {
  /** Full replacement content for the target field, as GFM-subset markdown. */
  markdown: string;
  reasoning: string;
  /**
   * Hash of the TARGET FIELD's text when this redraft was created. Per-field
   * (not per-section) so applying one draft never marks drafts for other
   * fields as stale.
   */
  fieldHashAtSuggestion?: string;
};

export function parseAiRedraftCommentContent(content: string): ParsedAiRedraftPayload {
  try {
    const parsed = JSON.parse(content) as Partial<ParsedAiRedraftPayload>;
    if (parsed && typeof parsed === "object" && typeof parsed.markdown === "string") {
      return {
        markdown: parsed.markdown,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
        fieldHashAtSuggestion:
          typeof parsed.fieldHashAtSuggestion === "string"
            ? parsed.fieldHashAtSuggestion
            : undefined,
      };
    }
  } catch {
    // legacy/plain content: treat the whole string as markdown
  }
  return { markdown: content, reasoning: "" };
}

export function serializeAiRedraftCommentContent(
  payload: ParsedAiRedraftPayload
): string {
  return JSON.stringify(payload);
}

/** AI suggestion kinds reviewed via the suggestion card. */
export function isAiSuggestionKind(kind: string): kind is "ai_fix" | "ai_redraft" {
  return kind === "ai_fix" || kind === "ai_redraft";
}

/** Open AI suggestions (fixes + redrafts) for a section, red-first then criterion order. */
export function sortedOpenSuggestionsForSection(
  section: SectionType,
  comments: CommentRecord[],
  evaluations: EvaluationRecord[]
): CommentRecord[] {
  const evalById = new Map(evaluations.map((e) => [e.id, e]));
  const open = comments.filter(
    (c) =>
      !c.parentId &&
      isAiSuggestionKind(c.kind) &&
      c.status === "open" &&
      c.section === section
  );

  return [...open].sort((a, b) => {
    const evalA = a.evaluationId ? evalById.get(a.evaluationId) : undefined;
    const evalB = b.evaluationId ? evalById.get(b.evaluationId) : undefined;
    const priA = evalA ? STATUS_PRIORITY[effectiveStatus(evalA)] : 3;
    const priB = evalB ? STATUS_PRIORITY[effectiveStatus(evalB)] : 3;
    if (priA !== priB) return priA - priB;
    const keyA = evalA?.criterionKey ?? "";
    const keyB = evalB?.criterionKey ?? "";
    const orderA = criterionDisplayIndex(section, keyA);
    const orderB = criterionDisplayIndex(section, keyB);
    if (orderA !== orderB) return orderA - orderB;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function activeSuggestionForSection(
  section: SectionType,
  comments: CommentRecord[],
  evaluations: EvaluationRecord[]
): CommentRecord | null {
  const sorted = sortedOpenSuggestionsForSection(section, comments, evaluations);
  return sorted[0] ?? null;
}

export function countOpenAiSuggestions(comments: readonly CommentRecord[]): number {
  return comments.filter(
    (c) => !c.parentId && isAiSuggestionKind(c.kind) && c.status === "open"
  ).length;
}

/**
 * Next card to offer after resolving `resolvedId` in `section`.
 * Same-section queue first (severity order), then later evaluatable
 * sections, then earlier ones. Each other section contributes its
 * active (first) open suggestion.
 */
export function nextOpenSuggestionAfterResolve(
  resolvedId: string,
  section: SectionType,
  comments: CommentRecord[],
  evaluations: EvaluationRecord[],
  sectionOrder: readonly SectionType[]
): CommentRecord | null {
  const remainingHere = sortedOpenSuggestionsForSection(
    section,
    comments,
    evaluations
  ).filter((c) => c.id !== resolvedId);
  if (remainingHere[0]) return remainingHere[0];

  const rank = sectionOrder.indexOf(section);
  const ordered =
    rank === -1
      ? sectionOrder
      : [...sectionOrder.slice(rank + 1), ...sectionOrder.slice(0, rank)];

  for (const nextSection of ordered) {
    const active = activeSuggestionForSection(
      nextSection,
      comments,
      evaluations
    );
    if (active && active.id !== resolvedId) return active;
  }
  return null;
}
