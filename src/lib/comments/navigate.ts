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
 * Returns true if the element was found.
 */
export function scrollToGutterAnchor(anchorId: string): boolean {
  const el = document.querySelector<HTMLElement>(
    `[data-gutter-anchor-id="${CSS.escape(anchorId)}"]`
  );
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

/**
 * Smoothly scroll the document field anchor for a comment into view.
 * Returns true if an element was found and scrolled to.
 */
export function scrollToCommentFieldAnchor(comment: CommentRecord): boolean {
  if (!comment.section || !comment.contentPath) return false;

  const value = `${comment.section}.${comment.contentPath}`;
  const escaped = CSS.escape(value);
  const el = document.querySelector<HTMLElement>(
    `[data-field-anchor="${escaped}"]`
  );
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}
