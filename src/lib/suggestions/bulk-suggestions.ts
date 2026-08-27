import type { SectionType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";
import type { SuggestionApplyMode } from "@/lib/document-types";
import {
  acceptSuggestion,
  dismissSuggestion,
} from "@/lib/suggestions/accept-suggestion";

export type BulkSuggestionResult = {
  appliedIds: string[];
  skippedIds: string[];
  failedIds: string[];
  nextSection: Record<string, unknown>;
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
