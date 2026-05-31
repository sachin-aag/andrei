import type { CommentRecord } from "@/types/report";

/**
 * Derive the gutter-anchor DOM id for a comment, matching the logic
 * in margin-gutter.tsx that assigns anchor ids.
 */
export function gutterAnchorIdForComment(comment: CommentRecord): string {
  const isEditorAnchored =
    comment.section &&
    comment.contentPath &&
    comment.fromPos != null &&
    comment.toPos != null;

  if (isEditorAnchored) {
    return comment.id;
  }

  if (comment.section && comment.contentPath) {
    return `field:${comment.id}`;
  }

  if (comment.section) {
    return `unanchored:${comment.id}`;
  }

  return comment.id;
}

/**
 * Smoothly scroll the gutter card with the given anchor id into view.
 */
export function scrollToGutterAnchor(anchorId: string): void {
  const el = document.querySelector<HTMLElement>(
    `[data-gutter-anchor-id="${CSS.escape(anchorId)}"]`
  );
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * Smoothly scroll the document field anchor for a comment into view.
 */
export function scrollToCommentFieldAnchor(comment: CommentRecord): void {
  if (!comment.section || !comment.contentPath) return;

  const value = `${comment.section}.${comment.contentPath}`;
  const escaped = CSS.escape(value);
  const el = document.querySelector<HTMLElement>(
    `[data-field-anchor="${escaped}"]`
  );
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}
