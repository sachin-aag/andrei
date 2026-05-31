import type { SectionType, CriterionStatus } from "@/db/schema";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import { hashContent } from "@/lib/ai/content-hash";
import { PROMPT_VERSION } from "@/lib/ai/section-prompts";
import { cleanSectionContentForEval } from "@/lib/tiptap/strip-pending-suggestions";
import {
  effectiveStatus,
  rowsForSection,
  type CriterionRow,
} from "@/lib/ai/criteria-view";
import { getCriteria } from "@/lib/ai/criteria";
import { shouldSkipSuggestForEvaluation } from "@/lib/placeholders/evaluation-policy";

const FAILING: CriterionStatus[] = ["not_met", "partially_met"];

export function sectionContentHash(section: SectionType, content: unknown): string {
  return hashContent(cleanSectionContentForEval(section, content), PROMPT_VERSION);
}

export function isFailingStatus(status: CriterionStatus): boolean {
  return FAILING.includes(status);
}

/** Failing criteria with no open ai_fix linked to their evaluation row. */
export function gapCriteriaForSection(
  section: SectionType,
  evaluations: EvaluationRecord[],
  comments: CommentRecord[],
  sectionContent: unknown
): CriterionRow[] {
  const rows = rowsForSection(section, evaluations).filter(
    (r) => !r.isPlaceholder && isFailingStatus(effectiveStatus(r))
  );
  const openFixEvalIds = new Set(
    comments
      .filter((c) => c.kind === "ai_fix" && c.status === "open" && c.evaluationId)
      .map((c) => c.evaluationId as string)
  );
  const hash = sectionContentHash(section, sectionContent);
  const gap = rows.filter((r) => {
    if (r.evaluatedContentHash && r.evaluatedContentHash !== hash) return false;
    if (shouldSkipSuggestForEvaluation(r.reasoning)) return false;
    return !openFixEvalIds.has(r.id);
  });

  return sortGapCriteria(section, gap);
}

/** not_met (red) first, then partially_met (yellow), then criterion order. */
export function sortGapCriteria(
  section: SectionType,
  rows: CriterionRow[]
): CriterionRow[] {
  return [...rows].sort((a, b) => {
    const priA = STATUS_PRIORITY[effectiveStatus(a)];
    const priB = STATUS_PRIORITY[effectiveStatus(b)];
    if (priA !== priB) return priA - priB;
    const orderA = criterionDisplayIndex(section, a.criterionKey);
    const orderB = criterionDisplayIndex(section, b.criterionKey);
    if (orderA !== orderB) return orderA - orderB;
    return a.criterionKey.localeCompare(b.criterionKey);
  });
}

export function canSuggestFixes(
  section: SectionType,
  evaluations: EvaluationRecord[],
  comments: CommentRecord[],
  sectionContent: unknown,
  opts?: { isEvaluating?: boolean; isSuggesting?: boolean }
): boolean {
  if (opts?.isEvaluating || opts?.isSuggesting) return false;
  return gapCriteriaForSection(section, evaluations, comments, sectionContent).length > 0;
}

const STATUS_PRIORITY: Record<CriterionStatus, number> = {
  not_met: 0,
  partially_met: 1,
  met: 2,
  not_evaluated: 3,
};

export function criterionDisplayIndex(section: SectionType, criterionKey: string): number {
  const defs = getCriteria(section);
  const idx = defs.findIndex((d) => d.key === criterionKey);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export type ParsedAiFixPayload = {
  deleteText: string;
  insertText: string;
  reasoning: string;
  /** Section content hash when this suggestion was created (staleness detection). */
  contentHashAtSuggestion?: string;
};

export function parseAiFixCommentContent(content: string): ParsedAiFixPayload {
  try {
    const parsed = JSON.parse(content) as Partial<ParsedAiFixPayload>;
    if (parsed && typeof parsed === "object" && "insertText" in parsed) {
      return {
        deleteText: typeof parsed.deleteText === "string" ? parsed.deleteText : "",
        insertText: typeof parsed.insertText === "string" ? parsed.insertText : "",
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
        contentHashAtSuggestion:
          typeof parsed.contentHashAtSuggestion === "string"
            ? parsed.contentHashAtSuggestion
            : undefined,
      };
    }
  } catch {
    // plain insert text
  }
  return { deleteText: "", insertText: content, reasoning: "" };
}

export function serializeAiFixCommentContent(payload: ParsedAiFixPayload): string {
  return JSON.stringify(payload);
}

/** Open ai_fix comments for a section, sorted red-first then criterion order. */
export function sortedOpenSuggestionsForSection(
  section: SectionType,
  comments: CommentRecord[],
  evaluations: EvaluationRecord[]
): CommentRecord[] {
  const evalById = new Map(evaluations.map((e) => [e.id, e]));
  const open = comments.filter(
    (c) =>
      !c.parentId &&
      c.kind === "ai_fix" &&
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
