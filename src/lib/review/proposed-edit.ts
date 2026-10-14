import type { ReviewFindingDto } from "./ui";

export type ProposedReviewEdit = {
  kind: "ai_fix" | "ai_grammar";
  anchorText: string;
  deleteText: string;
  insertText: string;
};

export function proposedEditFromMetadata(
  metadata: Record<string, unknown> | undefined
): ProposedReviewEdit | null {
  const raw = metadata?.proposedEdit;
  if (!raw || typeof raw !== "object") return null;
  const edit = raw as Record<string, unknown>;
  const kind = edit.kind;
  if (kind !== "ai_fix" && kind !== "ai_grammar") return null;
  const anchorText = typeof edit.anchorText === "string" ? edit.anchorText : "";
  const deleteText = typeof edit.deleteText === "string" ? edit.deleteText : "";
  const insertText = typeof edit.insertText === "string" ? edit.insertText : "";
  if (!anchorText.trim() && !deleteText.trim()) return null;
  return { kind, anchorText, deleteText, insertText };
}

export function commentReleasedToQueue(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { releasedToQueue?: unknown };
    return parsed?.releasedToQueue === true;
  } catch {
    return false;
  }
}

export function withReleasedToQueue(content: string, released: boolean): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (!released) {
        const rest = { ...parsed };
        delete rest.releasedToQueue;
        return JSON.stringify(rest);
      }
      return JSON.stringify({ ...parsed, releasedToQueue: true });
    }
  } catch {
    // wrap plain content
  }
  if (!released) return content;
  return JSON.stringify({ insertText: content, releasedToQueue: true });
}

/** Open review findings whose suggestion is not yet an in-document tracked change. */
export function heldReviewSuggestionIds(
  findings: Array<Pick<ReviewFindingDto, "commentId">>,
  comments: Array<{
    id: string;
    status: string;
    content: string;
    evaluationId?: string | null;
  }>
): Set<string> {
  const byId = new Map(comments.map((row) => [row.id, row]));
  const held = new Set<string>();
  for (const finding of findings) {
    if (!finding.commentId) continue;
    const comment = byId.get(finding.commentId);
    if (!comment || comment.status !== "open") continue;
    if (commentReleasedToQueue(comment.content)) continue;
    // AI Check / seed / criterion comments already belong in the document
    // queue. Only Review-created comments (no evaluationId) stay hidden
    // until Apply as tracked change.
    if (comment.evaluationId) continue;
    held.add(finding.commentId);
  }
  return held;
}

export function withoutHeldReviewSuggestions<
  T extends { id: string },
>(comments: readonly T[], heldIds: ReadonlySet<string>): T[] {
  if (heldIds.size === 0) return [...comments];
  return comments.filter((comment) => !heldIds.has(comment.id));
}

export function canGenerateReviewSuggestion(finding: {
  section: string | null;
  metadata: Record<string, unknown>;
}): boolean {
  return Boolean(
    finding.section &&
      typeof finding.metadata.criterionKey === "string" &&
      typeof finding.metadata.evaluationId === "string"
  );
}
