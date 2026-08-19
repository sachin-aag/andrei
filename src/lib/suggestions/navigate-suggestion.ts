import { suggestionFieldAnchorKey } from "@/lib/suggestions/resolve-suggestion-field-path";
import type { CommentRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

/** Gutter packing id for the active AI suggestion card in a section. */
export function suggestionGutterAnchorId(section: SectionType): string {
  return `suggestion:${section}`;
}

/**
 * Compact textboxes stay visually centered on the card. Anything taller (a
 * TipTap narrative, a full-field redraft) pins to the first line — centering
 * on the mark range puts the card in the middle of a multi-screen insert,
 * which reads as "missing" when the highlight starts on screen.
 */
export const SUGGESTION_FIELD_CENTER_MAX_PX = 240;

/** Viewport Y → gutter-container Y (`GutterAnchor.desiredTop`). */
export function suggestionAnchorY(
  viewportTop: number,
  containerTop: number
): number {
  return viewportTop - containerTop;
}

export function suggestionFieldGutterLayout(
  field: { top: number; height: number },
  containerTop: number
): { desiredTop: number; valignCenter: boolean } {
  if (field.height <= SUGGESTION_FIELD_CENTER_MAX_PX) {
    return {
      desiredTop: suggestionAnchorY(field.top + field.height / 2, containerTop),
      valignCenter: true,
    };
  }
  return {
    desiredTop: suggestionAnchorY(field.top, containerTop),
    valignCenter: false,
  };
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
