import { suggestionFieldAnchorKey } from "@/lib/suggestions/resolve-suggestion-field-path";
import type { CommentRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

/** Gutter packing id for the active AI suggestion card in a section. */
export function suggestionGutterAnchorId(section: SectionType): string {
  return `suggestion:${section}`;
}

/** Pure geometry helper — true when any of the rect is inside the viewport band. */
export function rectIntersectsViewport(
  rect: { top: number; bottom: number },
  viewportHeight: number,
  marginPx = 80
): boolean {
  return rect.bottom > marginPx && rect.top < viewportHeight - marginPx;
}

/** Field element a suggestion previews/applies into (`data-field-anchor`). */
export function querySuggestionFieldElement(
  comment: CommentRecord
): HTMLElement | null {
  if (!comment.section) return null;
  const key = suggestionFieldAnchorKey(
    comment.section as SectionType,
    comment.contentPath
  );
  const escaped = CSS.escape(key);
  return document.querySelector<HTMLElement>(
    `[data-field-anchor="${escaped}"]`
  );
}

/**
 * Whether the next suggestion's document target is already reasonably on screen.
 * Missing targets are treated as off-screen so we offer an explicit jump.
 */
export function isSuggestionTargetInViewport(
  comment: CommentRecord,
  marginPx = 80
): boolean {
  const el = querySuggestionFieldElement(comment);
  if (!el) {
    const sectionEl = comment.section
      ? document.getElementById(comment.section)
      : null;
    if (!sectionEl) return false;
    return rectIntersectsViewport(
      sectionEl.getBoundingClientRect(),
      window.innerHeight,
      marginPx
    );
  }
  return rectIntersectsViewport(
    el.getBoundingClientRect(),
    window.innerHeight,
    marginPx
  );
}

/** Smooth-scroll the suggestion's field (or section) into view. */
export function scrollToSuggestionComment(comment: CommentRecord): boolean {
  const field = querySuggestionFieldElement(comment);
  if (field) {
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }
  if (comment.section) {
    const heading = document.getElementById(comment.section);
    if (heading) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    }
  }
  return false;
}

/**
 * Vertical center of the section's suggestion gutter card, in gutter-container
 * coordinates (same space as `GutterAnchor.desiredTop` with `valignCenter`).
 */
export function measureSuggestionGutterParkCenterY(
  section: SectionType
): number | null {
  const id = suggestionGutterAnchorId(section);
  const card = document.querySelector<HTMLElement>(
    `[data-gutter-anchor-id="${CSS.escape(id)}"]`
  );
  if (!card) return null;
  const container = card.closest<HTMLElement>('[aria-label="Margin notes"]');
  if (!container) return null;
  const containerTop = container.getBoundingClientRect().top;
  const rect = card.getBoundingClientRect();
  return rect.top + rect.height / 2 - containerTop;
}
