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

export const GUTTER_CARD_GAP_PX = 8;
const GUTTER_CARD_HEIGHT_FALLBACK_PX = 80;

export type PackableGutterAnchor = {
  id: string;
  section?: string;
  desiredTop: number;
  valignCenter?: boolean;
};

/**
 * Pack cards so they do not overlap, but only against other cards in the
 * same section. A global top-down pack lets earlier full-draft cards shove
 * a later section's card into empty space below its field — the overflow
 * padding then grows that later section to "fit" the stray card.
 */
export function packGutterAnchors<T extends PackableGutterAnchor>(
  anchors: T[],
  heights: Record<string, number>,
  gap = GUTTER_CARD_GAP_PX
): Array<T & { top: number }> {
  const groups = new Map<string, T[]>();
  for (const a of anchors) {
    const key = a.section ?? a.id;
    const group = groups.get(key);
    if (group) group.push(a);
    else groups.set(key, [a]);
  }

  const packed: Array<T & { top: number }> = [];
  for (const group of groups.values()) {
    const sorted = group.toSorted((a, b) => a.desiredTop - b.desiredTop);
    let prevBottom = Number.NEGATIVE_INFINITY;
    for (const a of sorted) {
      const h = heights[a.id] ?? GUTTER_CARD_HEIGHT_FALLBACK_PX;
      const desired = a.valignCenter ? a.desiredTop - h / 2 : a.desiredTop;
      const top = Math.max(desired, prevBottom + gap);
      packed.push({ ...a, top });
      prevBottom = top + h;
    }
  }
  return packed.toSorted((a, b) => a.top - b.top || a.desiredTop - b.desiredTop);
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
