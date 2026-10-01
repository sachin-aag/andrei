/**
 * One Apply / Dismiss card at a time. The in-document slot and the review
 * margin both mount `SectionSuggestionCard` for the same section. Show the
 * document copy unless the margin column is actually painted *and* that
 * section currently has a gutter card.
 *
 * CSS `display: none` on every `.section-suggestion-slot` was the old mutex.
 * It hid leftover no-criteria slots (QSR acronyms / other details) that the
 * gutter never shows, and it still left two React trees when the query missed.
 */
export function isReviewGutterColumnPainted(
  box: { offsetWidth: number; offsetHeight: number } | null | undefined
): boolean {
  if (!box) return false;
  return box.offsetWidth > 0 && box.offsetHeight > 0;
}

export function showDocumentSuggestionCard(input: {
  documentSlot: boolean;
  gutterColumnPainted: boolean;
  sectionHasGutterCard: boolean;
}): boolean {
  if (!input.documentSlot) return true;
  if (input.gutterColumnPainted && input.sectionHasGutterCard) return false;
  return true;
}
