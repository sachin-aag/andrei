import {
  parseAiFixCommentContent,
  parseAiRedraftCommentContent,
} from "@/lib/ai/suggestion-gating";
import {
  applyEditToPlainText,
  isApplyableStatus,
  type EditScope,
} from "@/lib/suggestions/locator";

export type PendingProposalInput = {
  id: string;
  kind: string;
  createdAt: Date | string;
  content: string;
};

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

/**
 * Apply a targeted propose_edit to the open card whose body contains the
 * anchor. Used when the live field does not yet include unaccepted draft text
 * (the usual "add this fact to the suggestion" follow-up).
 *
 * Exact match only — paraphrased anchors miss rather than guess. Returns null
 * when no card matches uniquely.
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
