import {
  applyEditToPlainText,
  locateEdit,
  type SuggestionEdit as LocatorEdit,
} from "@/lib/suggestions/locator";

export function withLeadingSpaceIfNeeded(
  haystack: string,
  insertAt: number,
  insert: string
): string {
  if (!insert || /^\s/.test(insert)) return insert;
  if (insertAt <= 0) return insert;
  const before = haystack[insertAt - 1];
  return before !== undefined && !/\s/.test(before) ? ` ${insert}` : insert;
}

export type PlainTextEdit = {
  anchorText?: string;
  deleteText: string;
  insertText: string;
};

/** Locate a unique span for delete or anchor text in plain text. */
export function locateUniqueSpan(
  value: string,
  needle: string
): { start: number; end: number } | null {
  const trimmed = needle.trim();
  if (!trimmed) return null;
  const loc = locateEdit(value, {
    anchorText: trimmed,
    deleteText: trimmed,
    insertText: "x",
  });
  if (loc.status !== "located") return null;
  return { start: loc.deleteStart, end: loc.deleteEnd };
}

/**
 * Locate the delete span for a suggestion edit. When anchorText is present,
 * prefer locating deleteText inside the anchor slice.
 */
export function locatePlainTextDeleteSpan(
  value: string,
  edit: Pick<PlainTextEdit, "anchorText" | "deleteText">
): { start: number; end: number } | null {
  const del = edit.deleteText.trim();
  if (!del) return null;
  const loc = locateEdit(value, {
    anchorText: edit.anchorText ?? "",
    deleteText: del,
    insertText: "",
  });
  if (loc.status !== "located") return null;
  return { start: loc.deleteStart, end: loc.deleteEnd };
}

/** Apply a suggestion edit to plain text; returns null when not uniquely locatable. */
export function applyPlainTextEdit(
  value: string,
  edit: PlainTextEdit
): string | null {
  const locatorEdit: LocatorEdit = {
    anchorText: edit.anchorText ?? "",
    deleteText: edit.deleteText,
    insertText: edit.insertText,
  };
  const result = applyEditToPlainText(value, locatorEdit);
  if (result.status !== "located" && result.status !== "append") {
    return null;
  }
  return result.text;
}
