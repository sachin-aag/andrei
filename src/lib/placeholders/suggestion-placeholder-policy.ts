const PLACEHOLDER_IN_TEXT =
  /\[[^\]]*(?:<\s*)?to be filled(?:\s*>)?[^\]]*\]|<\s*to be filled(?:\s*:[^>]*)?\s*>/i;

/** True when the suggestion edits or replaces a to-be-filled placeholder token. */
export function suggestionEditsPlaceholder(s: {
  deleteText: string;
  insertText: string;
  anchorText: string;
}): boolean {
  const parts = [s.deleteText, s.insertText, s.anchorText];
  const touchesPlaceholder = parts.some((p) => PLACEHOLDER_IN_TEXT.test(p));
  if (!touchesPlaceholder) return false;

  // Replacing a placeholder with concrete prose (no to-be-filled left in insert).
  if (s.deleteText && PLACEHOLDER_IN_TEXT.test(s.deleteText) && !/to be filled/i.test(s.insertText)) {
    return true;
  }

  // Deleting a placeholder outright.
  if (s.deleteText && PLACEHOLDER_IN_TEXT.test(s.deleteText) && !s.insertText.trim()) {
    return true;
  }

  return false;
}
