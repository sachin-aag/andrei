import type { SectionType } from "@/db/schema";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import type { SuggestionApplyMode } from "@/lib/document-types";
import {
  applySuggestionToContent,
  patchSection,
  stripSuggestionFromContent,
} from "@/lib/suggestions/accept-suggestion";
import { patchCommentStatuses } from "@/lib/suggestions/persist-comment-status";
import { partitionBulkApplies } from "@/lib/suggestions/suggestion-overlap";
import {
  findSupersededSuggestions,
  resolutionReasonSupersededBy,
  withResolutionReason,
} from "@/lib/suggestions/supersession";
import {
  parseAiFixCommentContent,
  sortedOpenSuggestionsForSection,
} from "@/lib/ai/suggestion-gating";
import { sortCommentsForPairedApply } from "@/lib/suggestions/same-turn-block-pair";

export type BulkSuggestionResult = {
  appliedIds: string[];
  skippedIds: string[];
  failedIds: string[];
  dismissedIds: string[];
  dismissedContent: Record<string, string>;
  nextSection: Record<string, unknown>;
};

export type ReportBulkSuggestionResult = {
  appliedIds: string[];
  skippedIds: string[];
  failedIds: string[];
  dismissedIds: string[];
  dismissedContent: Record<string, string>;
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
  /** Called with the section's next content before persist, so the editor can
   *  show applied wording during the PATCH. Also called with the original on
   *  save failure so the caller can revert. */
  onSectionSettled?: (
    section: SectionType,
    nextSection: Record<string, unknown>
  ) => void;
  /** Always called once a section's batch is over, including on failure. */
  onSectionEnd?: (section: SectionType) => void;
};

function applyOneInMemory(args: {
  section: SectionType;
  comment: CommentRecord;
  sectionContent: Record<string, unknown>;
  applyMode?: SuggestionApplyMode;
  applied: Set<string>;
  appliedIds: string[];
  skippedIds: string[];
  ignorePlaceBeforePairedBlock?: boolean;
}): Record<string, unknown> {
  if (args.applied.has(args.comment.id)) return args.sectionContent;
  args.applied.add(args.comment.id);
  const result = applySuggestionToContent({
    section: args.section,
    comment: args.comment,
    sectionContent: args.sectionContent,
    applyMode: args.applyMode,
    ignorePlaceBeforePairedBlock: args.ignorePlaceBeforePairedBlock,
  });
  if (!result.ok) {
    args.skippedIds.push(args.comment.id);
    return args.sectionContent;
  }
  args.appliedIds.push(args.comment.id);
  return result.nextSection;
}

/**
 * Apply every remaining open suggestion. Non-overlapping edits are applied as
 * one in-memory batch. Overlapping edits in the same field are applied
 * recursively (each locate runs against the doc after the previous apply).
 * Locate failures are skipped. The section is PATCHed once; comment statuses
 * flip in parallel. A save failure fails every locatable apply in the section.
 */
export async function acceptAllSuggestions(args: {
  reportId: string;
  section: SectionType;
  comments: readonly CommentRecord[];
  sectionContent: Record<string, unknown>;
  applyMode?: SuggestionApplyMode;
  /** Fired with in-memory applied content before the section PATCH. */
  onPreview?: (nextSection: Record<string, unknown>) => void;
}): Promise<BulkSuggestionResult> {
  const partition = partitionBulkApplies({
    section: args.section,
    comments: args.comments,
    sectionContent: args.sectionContent,
  });
  const supersededPairs = findSupersededSuggestions({
    section: args.section,
    comments: args.comments,
    sectionContent: args.sectionContent,
  });
  const supersededIds = new Set(supersededPairs.map((pair) => pair.supersededId));

  let current = args.sectionContent;
  const appliedIds: string[] = [];
  // Leave unlocatable leftovers open. Dismissing them is a silent failure;
  // the toast reports the skip and the card stays so the engineer can act.
  const skippedIds: string[] = partition.unlocatableIds.filter(
    (id) => !supersededIds.has(id)
  );
  const applied = new Set<string>([
    ...partition.unlocatableIds,
    ...supersededIds,
  ]);
  const overlappingIds = new Set(
    partition.overlapping.flatMap((group) => group.map((c) => c.id))
  );

  for (const comment of args.comments) {
    if (applied.has(comment.id)) continue;
    if (overlappingIds.has(comment.id)) {
      const cluster = partition.overlapping.find((group) =>
        group.some((c) => c.id === comment.id)
      );
      if (!cluster) continue;
      const ordered = sortCommentsForPairedApply(cluster);
      const clusterIds = new Set(ordered.map((member) => member.id));
      for (const member of ordered) {
        if (supersededIds.has(member.id)) continue;
        const payload = parseAiFixCommentContent(member.content);
        current = applyOneInMemory({
          section: args.section,
          comment: member,
          sectionContent: current,
          applyMode: args.applyMode,
          applied,
          appliedIds,
          skippedIds,
          ignorePlaceBeforePairedBlock: Boolean(
            payload.pairedBlockSuggestionId &&
              clusterIds.has(payload.pairedBlockSuggestionId)
          ),
        });
      }
      continue;
    }
    current = applyOneInMemory({
      section: args.section,
      comment,
      sectionContent: current,
      applyMode: args.applyMode,
      applied,
      appliedIds,
      skippedIds,
    });
  }

  const dismissedIds = [...supersededIds];
  if (
    appliedIds.length === 0 &&
    dismissedIds.length === 0 &&
    skippedIds.length === 0
  ) {
    return {
      appliedIds,
      skippedIds,
      failedIds: [],
      dismissedIds,
      dismissedContent: {},
      nextSection: current,
    };
  }

  // Push the applied wording into the editor before the network round-trip
  // so insert text does not vanish while the section PATCH is in flight.
  if (appliedIds.length > 0) {
    args.onPreview?.(current);

    try {
      await patchSection(args.reportId, args.section, current);
    } catch {
      args.onPreview?.(args.sectionContent);
      return {
        appliedIds: [],
        skippedIds,
        failedIds: appliedIds,
        dismissedIds: [],
        dismissedContent: {},
        nextSection: args.sectionContent,
      };
    }
  }

  const { failedIds } = await patchCommentStatuses(
    args.reportId,
    appliedIds,
    "resolved"
  );
  const supersededById = new Map(
    supersededPairs.map((pair) => [pair.supersededId, pair.supersededBy])
  );
  const commentById = new Map(args.comments.map((c) => [c.id, c]));
  const dismissContent: Record<string, string> = {};
  for (const id of dismissedIds) {
    const row = commentById.get(id);
    const by = supersededById.get(id);
    if (!row || !by) continue;
    dismissContent[id] = withResolutionReason(
      row.content,
      resolutionReasonSupersededBy(by)
    );
  }
  if (dismissedIds.length > 0) {
    await patchCommentStatuses(
      args.reportId,
      dismissedIds,
      "dismissed",
      dismissContent
    );
  }
  const failed = new Set(failedIds);
  return {
    appliedIds: appliedIds.filter((id) => !failed.has(id)),
    skippedIds,
    failedIds,
    dismissedIds,
    dismissedContent: dismissContent,
    nextSection: current,
  };
}

export async function dismissAllSuggestions(args: {
  reportId: string;
  section: SectionType;
  comments: readonly CommentRecord[];
  sectionContent: Record<string, unknown>;
  onPreview?: (nextSection: Record<string, unknown>) => void;
}): Promise<BulkSuggestionResult> {
  let current = args.sectionContent;
  let changed = false;
  const candidateIds = args.comments.map((c) => c.id);

  for (const comment of args.comments) {
    const next = stripSuggestionFromContent({
      section: args.section,
      comment,
      sectionContent: current,
    });
    if (next) {
      current = next;
      changed = true;
    }
  }

  if (changed) {
    args.onPreview?.(current);
    try {
      await patchSection(args.reportId, args.section, current);
    } catch {
      args.onPreview?.(args.sectionContent);
      return {
        appliedIds: [],
        skippedIds: [],
        failedIds: candidateIds,
        dismissedIds: [],
        dismissedContent: {},
        nextSection: args.sectionContent,
      };
    }
  }

  const { failedIds } = await patchCommentStatuses(
    args.reportId,
    candidateIds,
    "dismissed"
  );
  const failed = new Set(failedIds);
  return {
    appliedIds: candidateIds.filter((id) => !failed.has(id)),
    skippedIds: [],
    failedIds,
    dismissedIds: [],
    dismissedContent: {},
    nextSection: current,
  };
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
  return runReportBulk(args, (queue, sectionContent, onPreview) =>
    acceptAllSuggestions({
      reportId: args.reportId,
      section: queue.section,
      comments: queue.comments,
      sectionContent,
      applyMode: args.applyMode,
      onPreview,
    })
  );
}

export async function dismissAllSuggestionsInReport(
  args: ReportBulkArgs
): Promise<ReportBulkSuggestionResult> {
  return runReportBulk(args, (queue, sectionContent, onPreview) =>
    dismissAllSuggestions({
      reportId: args.reportId,
      section: queue.section,
      comments: queue.comments,
      sectionContent,
      onPreview,
    })
  );
}

async function runReportBulk(
  args: ReportBulkArgs,
  runSection: (
    queue: { section: SectionType; comments: CommentRecord[] },
    sectionContent: Record<string, unknown>,
    onPreview: (nextSection: Record<string, unknown>) => void
  ) => Promise<BulkSuggestionResult>
): Promise<ReportBulkSuggestionResult> {
  const appliedIds: string[] = [];
  const skippedIds: string[] = [];
  const failedIds: string[] = [];
  const dismissedIds: string[] = [];
  const dismissedContent: Record<string, string> = {};
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
      const result = await runSection(queue, sectionContent, (next) => {
        args.onSectionSettled?.(queue.section, next);
      });

      appliedIds.push(...result.appliedIds);
      skippedIds.push(...result.skippedIds);
      failedIds.push(...result.failedIds);
      dismissedIds.push(...result.dismissedIds);
      Object.assign(dismissedContent, result.dismissedContent);
      if (result.appliedIds.length > 0) {
        changedSections.push(queue.section);
      }
    } finally {
      args.onSectionEnd?.(queue.section);
    }
  }

  return {
    appliedIds,
    skippedIds,
    failedIds,
    dismissedIds,
    dismissedContent,
    changedSections,
  };
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
