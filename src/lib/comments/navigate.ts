import type { CommentRecord } from "@/types/report";

/** Margin gutter wrapper id for a root comment (matches `margin-gutter` anchor ids). */
export function gutterAnchorIdForComment(comment: CommentRecord): string {
  const isEditorAnchored =
    comment.section != null &&
    comment.contentPath != null &&
    comment.fromPos != null &&
    comment.toPos != null;
  if (isEditorAnchored) return comment.id;
  if (comment.section && comment.contentPath) return `field:${comment.id}`;
  if (comment.section) return `unanchored:${comment.id}`;
  return comment.id;
}

function escapeFieldAnchor(value: string): string {
  return globalThis.CSS?.escape
    ? globalThis.CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

/** Scroll the document field (plain-text anchor) for a section-level comment. */
export function scrollToCommentFieldAnchor(comment: CommentRecord): void {
  if (!comment.section || !comment.contentPath) return;
  if (comment.fromPos != null && comment.toPos != null) return;

  const anchor = document.querySelector<HTMLElement>(
    `[data-field-anchor="${escapeFieldAnchor(`${comment.section}.${comment.contentPath}`)}"]`
  );
  if (!anchor) return;
  anchor.scrollIntoView({ behavior: "smooth", block: "center" });
  if (anchor instanceof HTMLTextAreaElement) {
    anchor.focus();
  }
}

export function scrollToGutterAnchor(gutterId: string): void {
  const escaped = escapeFieldAnchor(gutterId);
  document
    .querySelector<HTMLElement>(`[data-gutter-anchor-id="${escaped}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
