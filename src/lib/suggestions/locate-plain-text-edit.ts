import {
  countOccurrences,
  findAnchorInText,
} from "@/lib/text/normalize-for-anchor";

const NUMERIC_DATE_PATTERN = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;

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

function isTimePlaceholderInsert(insertText: string): boolean {
  return /\[[^\]]*\btime\b[^\]]*<to be filled>[^\]]*\]/i.test(insertText);
}

/**
 * Some older suggestions were generated as "pure inserts" without an anchor.
 * For time placeholders, prefer the obvious date in the sentence over the end
 * of the field so previews/apply stay near the missing fact.
 */
export function inferInsertPosition(
  value: string,
  insertText: string
): number | null {
  if (!isTimePlaceholderInsert(insertText)) return null;

  const matches = Array.from(value.matchAll(NUMERIC_DATE_PATTERN));
  if (matches.length !== 1) return null;

  const match = matches[0]!;
  return (match.index ?? 0) + match[0].length;
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
    const span = locateUniqueSpan(value, del);
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

  if (ins) {
    const insertAt = inferInsertPosition(value, ins);
    if (insertAt !== null) {
      const insert = withLeadingSpaceIfNeeded(value, insertAt, ins);
      return value.slice(0, insertAt) + insert + value.slice(insertAt);
    }
    return value + (value.length > 0 && !/\s$/.test(value) ? " " : "") + ins;
  }

  return null;
}
