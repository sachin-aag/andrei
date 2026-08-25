import { isAiSuggestionKind } from "@/lib/ai/suggestion-gating";
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
export const GUTTER_CARD_HEIGHT_FALLBACK_PX = 80;
/** Keep a parked "Go to next" card this far inside the scrollport. */
export const GUTTER_BRIDGE_VIEWPORT_MARGIN_PX = 16;

/**
 * Card top (gutter-container Y) that keeps a parked queue-bridge card inside
 * the visible scrollport. When the parked center is already on screen this
 * is just `parkCenterY - cardHeight / 2`; as the user scrolls, the result
 * clamps to the scrollport so the handoff stays visible until they jump or
 * dismiss.
 */
export function stickyGutterCardTop({
  parkCenterY,
  cardHeight,
  containerTop,
  viewportTop,
  viewportBottom,
  marginPx = GUTTER_BRIDGE_VIEWPORT_MARGIN_PX,
}: {
  parkCenterY: number;
  cardHeight: number;
  containerTop: number;
  viewportTop: number;
  viewportBottom: number;
  marginPx?: number;
}): number {
  const parkTop = parkCenterY - cardHeight / 2;
  const parkTopViewport = parkTop + containerTop;
  const minTopViewport = viewportTop + marginPx;
  const maxTopViewport = viewportBottom - marginPx - cardHeight;
  const clampedViewportTop =
    maxTopViewport < minTopViewport
      ? minTopViewport
      : Math.min(Math.max(parkTopViewport, minTopViewport), maxTopViewport);
  return clampedViewportTop - containerTop;
}

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

/**
 * How far the gutter cards for a section hang below the section itself.
 *
 * The workspace closes this gap by padding the section, which grows the very
 * rect measured here. Subtracting the padding already applied keeps the answer
 * a fixed point: without it the next measurement reads zero overflow, the
 * padding is dropped, the overflow reappears, and the layout oscillates every
 * frame.
 */
export function sectionOverflowPx({
  sectionBottom,
  appliedPaddingPx,
  maxCardBottom,
}: {
  sectionBottom: number;
  appliedPaddingPx: number;
  maxCardBottom: number;
}): number {
  const naturalBottom = sectionBottom - appliedPaddingPx;
  return Math.max(0, maxCardBottom - naturalBottom);
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

/** First painted suggestion mark (inline insert/delete), if the preview is up. */
export function querySuggestionStartElement(
  comment: CommentRecord
): HTMLElement | null {
  const mark = document.querySelector<HTMLElement>(
    `[data-eval-id="${CSS.escape(comment.id)}"]`
  );
  if (mark) return mark;
  return querySuggestionFieldElement(comment);
}

export function querySuggestionGutterCard(
  section: SectionType
): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-gutter-anchor-id="${CSS.escape(suggestionGutterAnchorId(section))}"]`
  );
}

/**
 * After a card is generated, pin the viewport to the start of the suggestion
 * and keep its gutter card on screen. Tall fields / mark spans use `start`
 * so the first line is not scrolled off; compact fields stay centered.
 */
export function scrollToGeneratedSuggestion(comment: CommentRecord): boolean {
  const start = querySuggestionStartElement(comment);
  const field = querySuggestionFieldElement(comment);
  const pinToStart =
    (start != null && start !== field) ||
    (field != null &&
      field.getBoundingClientRect().height > SUGGESTION_FIELD_CENTER_MAX_PX);

  let scrolled = false;
  if (start) {
    start.scrollIntoView({
      behavior: "smooth",
      block: pinToStart ? "start" : "center",
    });
    scrolled = true;
  } else if (comment.section) {
    const heading = document.getElementById(comment.section);
    if (heading) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      scrolled = true;
    }
  }

  if (comment.section) {
    const card = querySuggestionGutterCard(comment.section);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      scrolled = true;
    }
  }
  return scrolled;
}

/**
 * First newly generated open AI suggestion, in document order. A batch
 * that lands on several sections at once (chat drafts, or five sections
 * suggested together) should pin the viewport to that card — not the
 * first already-open suggestion, and not the last timestamp.
 */
export function firstGeneratedSuggestion(
  previousIds: ReadonlySet<string>,
  comments: readonly CommentRecord[],
  sectionOrder: readonly SectionType[]
): CommentRecord | null {
  const rankBySection = new Map(
    sectionOrder.map((section, index) => [section, index])
  );
  let first: CommentRecord | null = null;
  let firstRank = Number.POSITIVE_INFINITY;
  for (const comment of comments) {
    if (comment.parentId) continue;
    if (comment.status !== "open") continue;
    if (!isAiSuggestionKind(comment.kind)) continue;
    if (!comment.section) continue;
    if (previousIds.has(comment.id)) continue;
    const rank =
      rankBySection.get(comment.section as SectionType) ??
      Number.MAX_SAFE_INTEGER;
    if (
      !first ||
      rank < firstRank ||
      (rank === firstRank && comment.createdAt < first.createdAt)
    ) {
      first = comment;
      firstRank = rank;
    }
  }
  return first;
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
