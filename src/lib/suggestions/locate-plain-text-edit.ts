import {
  countOccurrences,
  findAnchorInText,
} from "@/lib/text/normalize-for-anchor";

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

/** Locate a unique span for delete or anchor text in plain text. */
export function locateUniqueSpan(
  value: string,
  needle: string
): { start: number; end: number } | null {
  const trimmed = needle.trim();
  if (!trimmed) return null;
  if (countOccurrences(value, trimmed) !== 1) return null;
  const match = findAnchorInText(value, trimmed);
  if (!match) return null;
  return { start: match.start, end: match.end };
}

/**
 * Locate the delete span for a suggestion edit. When anchorText is present,
 * prefer locating deleteText inside the anchor slice (same order as TipTap
 * inject + canLocateEditInPlainText) before falling back to the full field.
 */
export function locatePlainTextDeleteSpan(
  value: string,
  edit: Pick<PlainTextEdit, "anchorText" | "deleteText">
): { start: number; end: number } | null {
  const del = edit.deleteText.trim();
  const anchor = (edit.anchorText ?? "").trim();
  if (!del) return null;

  if (anchor) {
    if (countOccurrences(value, anchor) === 1) {
      const anchorMatch = findAnchorInText(value, anchor);
      if (anchorMatch) {
        const scopedText = value.slice(anchorMatch.start, anchorMatch.end);
        const inner = locateUniqueSpan(scopedText, del);
        if (inner) {
          return {
            start: anchorMatch.start + inner.start,
            end: anchorMatch.start + inner.end,
          };
        }
      }
    }
  }

  return locateUniqueSpan(value, del);
}

export type PlainTextEdit = {
  anchorText?: string;
  deleteText: string;
  insertText: string;
};

/** Apply a suggestion edit to plain text; returns null when not uniquely locatable. */
export function applyPlainTextEdit(
  value: string,
  edit: PlainTextEdit
): string | null {
  const del = edit.deleteText.trim();
  const ins = edit.insertText.trim();
  const anchor = (edit.anchorText ?? "").trim();

  if (!del && !ins) return null;

  if (del) {
    const span = locatePlainTextDeleteSpan(value, edit);
    if (!span) return null;
    const insert = withLeadingSpaceIfNeeded(value, span.start, ins);
    return value.slice(0, span.start) + insert + value.slice(span.end);
  }

  if (anchor) {
    const span = locateUniqueSpan(value, anchor);
    if (!span) return null;
    const insertAt = span.end;
    const insert = withLeadingSpaceIfNeeded(value, insertAt, ins);
    return value.slice(0, insertAt) + insert + value.slice(insertAt);
  }

  if (ins) return value + (value.length > 0 && !/\s$/.test(value) ? " " : "") + ins;

  return null;
}
