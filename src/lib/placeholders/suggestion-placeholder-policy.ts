import { collectPlaceholderSpans } from "./find";

/** True when the suggestion edits or replaces a to-be-filled placeholder token. */
export function suggestionEditsPlaceholder(s: {
  deleteText: string;
  insertText: string;
  anchorText: string;
}): boolean {
  const parts = [s.deleteText, s.insertText, s.anchorText];
  const touchesPlaceholder = parts.some(
    (p) => collectPlaceholderSpans(p).length > 0
  );
  if (!touchesPlaceholder) return false;

  const deleteHasPlaceholder = collectPlaceholderSpans(s.deleteText).length > 0;
  const insertHasPlaceholder = collectPlaceholderSpans(s.insertText).length > 0;

  // Replacing a placeholder with concrete prose (no placeholder left in insert).
  if (
    s.deleteText &&
    deleteHasPlaceholder &&
    !insertHasPlaceholder &&
    !/to be filled/i.test(s.insertText)
  ) {
    return true;
  }

  // Deleting a placeholder outright.
  if (s.deleteText && deleteHasPlaceholder && !s.insertText.trim()) {
    return true;
  }

  return false;
}
