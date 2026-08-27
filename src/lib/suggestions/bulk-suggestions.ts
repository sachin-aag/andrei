import type { SectionType } from "@/db/schema";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import type { SuggestionApplyMode } from "@/lib/document-types";
import {
  acceptSuggestion,
  dismissSuggestion,
} from "@/lib/suggestions/accept-suggestion";
import { sortedOpenSuggestionsForSection } from "@/lib/ai/suggestion-gating";

export type BulkSuggestionResult = {
  appliedIds: string[];
  skippedIds: string[];
  failedIds: string[];
  nextSection: Record<string, unknown>;
};

export type ReportBulkSuggestionResult = {
  appliedIds: string[];
  skippedIds: string[];
  failedIds: string[];
  /** Sections whose content actually changed, in the order they were run. */
  changedSections: SectionType[];
};

type ReportBulkArgs = {
  reportId: string;
  sectionOrder: readonly SectionType[];
  comments: readonly CommentRecord[];
  evaluations: readonly EvaluationRecord[];
  sectionContentFor: (section: SectionType) => Record<string, unknown> | undefined;
  /** Called before a section's batch so the caller can pause its auto-save. */
  onSectionStart?: (section: SectionType, firstCommentId: string) => void;
  /** Called after a section's batch with its final content, only if it changed. */
  onSectionSettled?: (
    section: SectionType,
    nextSection: Record<string, unknown>
  ) => void;
  /** Always called once a section's batch is over, including on failure. */
  onSectionEnd?: (section: SectionType) => void;
};

/**
 * Apply every remaining open suggestion in queue order. Locate failures are
 * skipped so a stale card does not block the rest. A save/status failure
 * stops the batch — later edits would be based on unsaved content.
 */
export async function acceptAllSuggestions(args: {
  reportId: string;
  section: SectionType;
  comments: readonly CommentRecord[];
  sectionContent: Record<string, unknown>;
  applyMode?: SuggestionApplyMode;
}): Promise<BulkSuggestionResult> {
  let current = args.sectionContent;
  const appliedIds: string[] = [];
  const skippedIds: string[] = [];
  const failedIds: string[] = [];

  for (const comment of args.comments) {
    const result = await acceptSuggestion({
      reportId: args.reportId,
      section: args.section,
      comment,
      sectionContent: current,
      applyMode: args.applyMode,
    });
    if (result.ok) {
      current = result.nextSection;
      appliedIds.push(comment.id);
      continue;
    }
    if (result.reason === "save_failed" || result.reason === "status_failed") {
      failedIds.push(comment.id);
      break;
    }
    skippedIds.push(comment.id);
  }

  return { appliedIds, skippedIds, failedIds, nextSection: current };
}

export async function dismissAllSuggestions(args: {
  reportId: string;
  section: SectionType;
  comments: readonly CommentRecord[];
  sectionContent: Record<string, unknown>;
}): Promise<BulkSuggestionResult> {
  let current = args.sectionContent;
  const appliedIds: string[] = [];
  const skippedIds: string[] = [];
  const failedIds: string[] = [];

  for (const comment of args.comments) {
    const result = await dismissSuggestion({
      reportId: args.reportId,
      section: args.section,
      comment,
      sectionContent: current,
    });
    if (result.ok) {
      if (result.nextSection) current = result.nextSection;
      appliedIds.push(comment.id);
      continue;
    }
    failedIds.push(comment.id);
    if (result.reason === "save_failed") break;
  }

  return { appliedIds, skippedIds, failedIds, nextSection: current };
}

export function shouldShowSuggestionBulkActions(queueTotal: number): boolean {
  return queueTotal > 1;
}

/**
 * Per-section queues in document order, skipping sections with nothing open.
 * Each section keeps its own severity ordering.
 */
export function reportSuggestionQueues(
  sectionOrder: readonly SectionType[],
  comments: readonly CommentRecord[],
  evaluations: readonly EvaluationRecord[]
): { section: SectionType; comments: CommentRecord[] }[] {
  const queues: { section: SectionType; comments: CommentRecord[] }[] = [];
  for (const section of sectionOrder) {
    const open = sortedOpenSuggestionsForSection(
      section,
      [...comments],
      [...evaluations]
    );
    if (open.length > 0) queues.push({ section, comments: open });
  }
  return queues;
}

/**
 * Apply every open suggestion in the whole document, section by section in
 * document order. A save failure aborts that section only — the remaining
 * sections are independent content and still get their turn.
 */
export async function acceptAllSuggestionsInReport(
  args: ReportBulkArgs & { applyMode?: SuggestionApplyMode }
): Promise<ReportBulkSuggestionResult> {
  return runReportBulk(args, (queue, sectionContent) =>
    acceptAllSuggestions({
      reportId: args.reportId,
      section: queue.section,
      comments: queue.comments,
      sectionContent,
      applyMode: args.applyMode,
    })
  );
}

export async function dismissAllSuggestionsInReport(
  args: ReportBulkArgs
): Promise<ReportBulkSuggestionResult> {
  return runReportBulk(args, (queue, sectionContent) =>
    dismissAllSuggestions({
      reportId: args.reportId,
      section: queue.section,
      comments: queue.comments,
      sectionContent,
    })
  );
}

async function runReportBulk(
  args: ReportBulkArgs,
  runSection: (
    queue: { section: SectionType; comments: CommentRecord[] },
    sectionContent: Record<string, unknown>
  ) => Promise<BulkSuggestionResult>
): Promise<ReportBulkSuggestionResult> {
  const appliedIds: string[] = [];
  const skippedIds: string[] = [];
  const failedIds: string[] = [];
  const changedSections: SectionType[] = [];

  const queues = reportSuggestionQueues(
    args.sectionOrder,
    args.comments,
    args.evaluations
  );

  for (const queue of queues) {
    const sectionContent = args.sectionContentFor(queue.section);
    if (!sectionContent) {
      skippedIds.push(...queue.comments.map((c) => c.id));
      continue;
    }

    args.onSectionStart?.(queue.section, queue.comments[0].id);
    try {
      const result = await runSection(queue, sectionContent);

      appliedIds.push(...result.appliedIds);
      skippedIds.push(...result.skippedIds);
      failedIds.push(...result.failedIds);
      if (result.appliedIds.length > 0) {
        changedSections.push(queue.section);
        args.onSectionSettled?.(queue.section, result.nextSection);
      }
    } finally {
      args.onSectionEnd?.(queue.section);
    }
  }

  return { appliedIds, skippedIds, failedIds, changedSections };
}

export function formatBulkApplyToast(
  applied: number,
  skipped: number
): string {
  if (applied === 0 && skipped === 0) return "No suggestions to apply.";
  if (applied === 0) {
    return skipped === 1
      ? "This suggestion no longer fits. Dismiss it or run Suggest fixes again."
      : "None of these suggestions could be applied. Dismiss them or run Suggest fixes again.";
  }
  const appliedText =
    applied === 1 ? "Applied 1 suggestion" : `Applied ${applied} suggestions`;
  if (skipped === 0) return appliedText;
  return skipped === 1
    ? `${appliedText}. 1 no longer fits and was left open.`
    : `${appliedText}. ${skipped} no longer fit and were left open.`;
}

export function formatBulkDismissToast(
  dismissed: number,
  failed: number
): string {
  if (dismissed === 0 && failed === 0) return "No suggestions to dismiss.";
  if (dismissed === 0) {
    return failed === 1
      ? "Could not dismiss this suggestion."
      : "Could not dismiss these suggestions.";
  }
  const dismissedText =
    dismissed === 1
      ? "Dismissed 1 suggestion"
      : `Dismissed ${dismissed} suggestions`;
  if (failed === 0) return dismissedText;
  return failed === 1
    ? `${dismissedText}. 1 could not be updated.`
    : `${dismissedText}. ${failed} could not be updated.`;
}
