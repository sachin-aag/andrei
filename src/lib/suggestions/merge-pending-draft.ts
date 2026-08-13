import {
  parseAiFixCommentContent,
  parseAiRedraftCommentContent,
} from "@/lib/ai/suggestion-gating";
import { markdownToPlainText } from "@/lib/tiptap/markdown-to-doc";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";
import {
  applyEditToPlainText,
  isApplyableStatus,
  type EditScope,
} from "@/lib/suggestions/locator";
import { splitMarkdownIntoBlocks } from "@/lib/suggestions/diff-redraft";
import { wordSimilarity } from "@/lib/suggestions/word-diff";

/**
 * Token overlap at or above this means a new draft block is a revision of an
 * open card, not a second copy of the same information.
 */
export const PENDING_MERGE_MIN_SIMILARITY = 0.5;

/** Near-identical bodies across cards are duplicates — keep one. */
const DUPLICATE_SLOT_SIMILARITY = 0.85;

export type PendingProposalInput = {
  id: string;
  kind: string;
  createdAt: Date | string;
  content: string;
};

export type MergeSlot =
  | { kind: "update"; id: string; markdown: string; unchanged: boolean }
  | { kind: "create"; markdown: string };

export type PendingDraftMergePlan = {
  /** Proposed blocks in document order, assigned to an existing card or a new one. */
  slots: MergeSlot[];
  /** Open cards whose information is now in another slot (or dropped by the rewrite). */
  dismissIds: string[];
  inheritedCreatedAt: Date | null;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function plain(markdown: string): string {
  return collapseWhitespace(markdownToPlainText(markdown)).trim();
}

/** Reviewable body of an open AI proposal — the text the engineer sees on the card. */
export function pendingProposalBody(kind: string, content: string): string {
  if (kind === "ai_redraft") {
    return parseAiRedraftCommentContent(content).markdown.trim();
  }
  const payload = parseAiFixCommentContent(content);
  const fromBlock = payload.blockEdit?.proposedMarkdown?.trim() ?? "";
  if (fromBlock) return fromBlock;
  return (payload.insertText || payload.deleteText || "").trim();
}

function earliestCreatedAt(pending: readonly PendingProposalInput[]): Date | null {
  if (pending.length === 0) return null;
  return pending.reduce<Date | null>((acc, row) => {
    const at = asDate(row.createdAt);
    return acc === null || at < acc ? at : acc;
  }, null);
}

function collapseDuplicateSlots(slots: MergeSlot[]): {
  slots: MergeSlot[];
  extraDismissIds: string[];
} {
  const kept: MergeSlot[] = [];
  const extraDismissIds: string[] = [];
  for (const slot of slots) {
    const text = plain(slot.markdown);
    const dupOf = kept.findIndex((k) => wordSimilarity(plain(k.markdown), text) >= DUPLICATE_SLOT_SIMILARITY);
    if (dupOf < 0) {
      kept.push(slot);
      continue;
    }
    const existing = kept[dupOf]!;
    // Prefer the longer body so unique added facts are not dropped.
    if (slot.markdown.trim().length > existing.markdown.trim().length) {
      if (existing.kind === "update") extraDismissIds.push(existing.id);
      kept[dupOf] =
        slot.kind === "update"
          ? slot
          : existing.kind === "update"
            ? { kind: "update", id: existing.id, markdown: slot.markdown, unchanged: false }
            : slot;
    } else if (slot.kind === "update") {
      extraDismissIds.push(slot.id);
    }
  }
  return { slots: kept, extraDismissIds };
}

/**
 * Decide whether a full-field draft should update open cards, add new ones, or
 * both. Multiple cards exist so a large draft is reviewable in pieces — they
 * must not repeat the same information.
 *
 * Returns null when there is nothing open to merge with (caller diffs as a
 * fresh draft). When every proposed block is unrelated to the open cards,
 * also returns null so the caller can supersede them and diff against the
 * live field (tables, cell edits, non-empty documents).
 */
export function planPendingDraftMerge(opts: {
  proposedMarkdown: string;
  pending: readonly PendingProposalInput[];
}): PendingDraftMergePlan | null {
  if (opts.pending.length === 0) return null;
  const proposedBlocks = splitMarkdownIntoBlocks(opts.proposedMarkdown);
  if (proposedBlocks.length === 0) return null;

  const units = opts.pending
    .map((p) => ({
      ...p,
      body: pendingProposalBody(p.kind, p.content),
    }))
    .filter((u) => plain(u.body).length > 0);
  if (units.length === 0) return null;

  const used = new Set<string>();
  const rawSlots: MergeSlot[] = [];

  for (const block of proposedBlocks) {
    const blockPlain = plain(block);
    let best: { id: string; sim: number; body: string } | null = null;
    for (const u of units) {
      if (used.has(u.id)) continue;
      const sim = wordSimilarity(plain(u.body), blockPlain);
      if (!best || sim > best.sim) best = { id: u.id, sim, body: u.body };
    }
    if (best && best.sim >= PENDING_MERGE_MIN_SIMILARITY) {
      used.add(best.id);
      rawSlots.push({
        kind: "update",
        id: best.id,
        markdown: block,
        unchanged: plain(best.body) === blockPlain,
      });
    } else {
      rawSlots.push({ kind: "create", markdown: block });
    }
  }

  const matched = rawSlots.some((s) => s.kind === "update");
  if (!matched) return null;

  const { slots, extraDismissIds } = collapseDuplicateSlots(rawSlots);
  const usedAfterCollapse = new Set(
    slots.flatMap((s) => (s.kind === "update" ? [s.id] : []))
  );
  const dismissIds = [
    ...units.filter((u) => !usedAfterCollapse.has(u.id)).map((u) => u.id),
    ...extraDismissIds.filter((id) => !usedAfterCollapse.has(id)),
  ];
  const uniqueDismiss = [...new Set(dismissIds)];
  const touched = slots
    .filter((s): s is Extract<MergeSlot, { kind: "update" }> => s.kind === "update")
    .map((s) => units.find((u) => u.id === s.id))
    .filter((u): u is (typeof units)[number] => u != null);
  const dismissed = units.filter((u) => uniqueDismiss.includes(u.id));

  return {
    slots,
    dismissIds: uniqueDismiss,
    inheritedCreatedAt: earliestCreatedAt([...touched, ...dismissed]),
  };
}

/**
 * Apply a targeted propose_edit to the open card whose body contains the
 * anchor. Used when the live field does not yet include unaccepted draft text
 * (the usual "add this fact to the suggestion" follow-up).
 *
 * Returns null when no card matches uniquely.
 */
export function applyTargetedEditToPending(opts: {
  pending: readonly PendingProposalInput[];
  edit: {
    anchorText: string;
    deleteText: string;
    insertText: string;
    scope?: EditScope;
  };
}): { id: string; nextMarkdown: string } | null {
  if (opts.edit.scope) return null;

  const hits: Array<{ id: string; nextMarkdown: string }> = [];
  for (const row of opts.pending) {
    const body = pendingProposalBody(row.kind, row.content);
    if (!body) continue;
    const applied = applyEditToPlainText(body, {
      anchorText: opts.edit.anchorText,
      deleteText: opts.edit.deleteText,
      insertText: opts.edit.insertText,
      scope: opts.edit.scope,
    });
    if (!isApplyableStatus(applied.status)) continue;
    if (applied.text === body) continue;
    hits.push({ id: row.id, nextMarkdown: applied.text });
  }
  if (hits.length !== 1) return null;
  return hits[0]!;
}
