import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import {
  flattenForAnchor,
  locateEdit,
  uniqueTextSpan,
} from "@/lib/suggestions/locator";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";

/**
 * Where "Show in document" paints yellow.
 * - `contentPath: null` → the whole section.
 * - empty `anchor` and `needle` → the whole field.
 * - otherwise `needle` inside the unique `anchor` (or the anchor itself).
 */
export type ReviewLocateTarget = {
  section: string;
  contentPath: string | null;
  anchor: string;
  needle: string;
  /** Which exact copy of `needle` when the anchor cannot be made unique. */
  occurrence?: number;
};

export type ReviewLocateHighlight = ReviewLocateTarget & {
  findingId: string;
};

export type ReviewLocateScope = "text" | "field" | "section";

export function reviewLocateScope(
  target: Pick<ReviewLocateTarget, "contentPath" | "anchor" | "needle">
): ReviewLocateScope {
  if (!target.contentPath) return "section";
  if (!target.anchor.trim() && !target.needle.trim()) return "field";
  return "text";
}

export function reviewLocateMatchesField(
  target: ReviewLocateTarget | null,
  section: string,
  contentPath: string
): boolean {
  return Boolean(
    target && target.section === section && target.contentPath === contentPath
  );
}

/**
 * Same anchor → inner-span rule the suggestion locator uses for Apply.
 * `occurrence` picks one of several identical copies (table cells) when no
 * unique anchor exists.
 */
export function findReviewLocateSpan(
  text: string,
  target: Pick<ReviewLocateTarget, "anchor" | "needle" | "occurrence">
): { start: number; end: number } | null {
  const anchor = target.anchor.trim();
  const needle = target.needle.trim();
  if (anchor && needle && anchor !== needle) {
    const located = locateEdit(text, {
      anchorText: anchor,
      deleteText: needle,
      insertText: "",
    });
    if (located.status === "located") {
      return { start: located.deleteStart, end: located.deleteEnd };
    }
  } else if (needle || anchor) {
    const span = uniqueTextSpan(text, needle || anchor);
    if (span) return span;
  }
  if (needle && target.occurrence != null) {
    return nthOccurrence(text, needle, target.occurrence);
  }
  return null;
}

/** Current text of one field, flattened the way checks and the locator read it. */
export function reviewFieldText(
  sectionContent: unknown,
  section: string,
  contentPath: string
): string | null {
  if (!sectionContent || typeof sectionContent !== "object") return null;
  const record = sectionContent as Record<string, unknown>;
  if (isRichTargetField(section, contentPath)) {
    return flattenForAnchor(getRichFieldValue(record, contentPath)).text;
  }
  return getPlainTextFieldValue(record, contentPath);
}

/**
 * Why the highlight is not one exact phrase, or null when it is.
 * `fieldText` is the field's current text (null when unknown).
 */
export function reviewLocateHint(
  target: ReviewLocateTarget,
  fieldText: string | null
): string | null {
  const scope = reviewLocateScope(target);
  if (scope === "section") {
    return "This finding is about the whole section, so the section is highlighted.";
  }
  if (scope === "field") {
    return "This change touches more than one place, so the whole field is highlighted.";
  }
  if (fieldText != null && !findReviewLocateSpan(fieldText, target)) {
    return "The exact text was edited or now appears more than once, so the whole field is highlighted. Re-run the check to refresh it.";
  }
  return null;
}

function growLeft(text: string, from: number, floor: number): number {
  let i = from;
  while (i > floor && /\s/.test(text[i - 1]!)) i--;
  while (i > floor && !/\s/.test(text[i - 1]!)) i--;
  return i;
}

function growRight(text: string, to: number, ceil: number): number {
  let i = to;
  while (i < ceil && /\s/.test(text[i]!)) i++;
  while (i < ceil && !/\s/.test(text[i]!)) i++;
  return i;
}

/**
 * Smallest same-line window around `[start, end)` that occurs once in `text`,
 * so a repeated token (`[1]`, a date, `Table 3`) still paints the right copy.
 */
export function uniqueAnchorAround(
  text: string,
  start: number,
  end: number,
  maxLength = 200
): string | null {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const newline = text.indexOf("\n", end);
  const lineEnd = newline < 0 ? text.length : newline;
  let from = start;
  let to = end;
  for (;;) {
    const candidate = text.slice(from, to).trim();
    if (candidate && uniqueTextSpan(text, candidate)) return candidate;
    if ((from <= lineStart && to >= lineEnd) || to - from >= maxLength) {
      return null;
    }
    from = growLeft(text, from, lineStart);
    to = growRight(text, to, lineEnd);
  }
}

export type ReviewLocateMetadata = {
  focusText: string;
  focusOccurrence?: number;
};

/** Anchor + finding metadata for a regex match in a flattened field. */
export function locateFieldsForMatch(
  text: string,
  start: number,
  token: string
): { anchorText: string; metadata: ReviewLocateMetadata } {
  const focus = token.trim();
  if (!focus) return { anchorText: token, metadata: { focusText: token } };
  const focusStart = start + token.indexOf(focus);
  const anchor = uniqueAnchorAround(text, focusStart, focusStart + focus.length);
  if (anchor) return { anchorText: anchor, metadata: { focusText: focus } };
  return {
    anchorText: focus,
    metadata: {
      focusText: focus,
      focusOccurrence: occurrenceIndexAt(text, focus, focusStart),
    },
  };
}

/** How many exact copies of `needle` start before `at` (identical table cells). */
function occurrenceIndexAt(text: string, needle: string, at: number): number {
  let count = 0;
  let from = text.indexOf(needle);
  while (from >= 0 && from < at) {
    count++;
    from = text.indexOf(needle, from + 1);
  }
  return count;
}

function nthOccurrence(
  text: string,
  needle: string,
  n: number
): { start: number; end: number } | null {
  let from = text.indexOf(needle);
  for (let i = 0; i < n && from >= 0; i++) {
    from = text.indexOf(needle, from + 1);
  }
  return from >= 0 ? { start: from, end: from + needle.length } : null;
}

/** First field in `section` that holds `quote` exactly once. */
export function resolveQuoteInFields(
  fields: ReadonlyArray<{ section: string; contentPath: string; text: string }>,
  section: string,
  quote: string
): { contentPath: string; anchorText: string } | null {
  const cleaned = quote
    .trim()
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
    .replace(/(?:\s*(?:\.\.\.|…))+$/u, "")
    .trim();
  if (cleaned.length < 3) return null;
  for (const field of fields) {
    if (field.section !== section) continue;
    if (uniqueTextSpan(field.text, cleaned)) {
      return { contentPath: field.contentPath, anchorText: cleaned };
    }
  }
  return null;
}
