import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";

export type Placeholder = {
  id: string;
  section: SectionType;
  contentPath: string;
  fromPos: number;
  toPos: number;
  text: string;
};

/**
 * Regex to find placeholders in the text.
 * Matches a bracketed placeholder containing either `<to be filled>` or
 * `to be filled`. AI suggestions sometimes omit the angle brackets, so keep
 * both forms visible in the completion checklist.
 * Examples: `[Batch No. 1: <to be filled>]`, `[<to be filled>]`, `[to be filled]`
 */
export const PLACEHOLDER_REGEX = /\[[^\]]*(?:<\s*)?to be filled(?:\s*>)?[^\]]*\]/gi;

/** Any `[...]` span; paired with exclusions in `collectPlaceholderSpans`. */
export const BRACKET_SPAN_REGEX = /\[[^\]]+\]/g;

/** Citation-style `[12]` — not treated as an editable placeholder. */
export const NUMERIC_ONLY_BRACKET = /^\[\s*\d+\s*\]$/;

type TextSpan = { fromRel: number; toRel: number; text: string };

/**
 * True when `[...]` is guidance the author or AI should replace—not static prose
 * such as SOP acceptance criteria that happen to be wrapped in brackets on import.
 */
export function isActionablePlaceholderBracket(match: string): boolean {
  if (!/^\[[^\]]+\]$/.test(match)) return false;
  if (NUMERIC_ONLY_BRACKET.test(match)) return false;

  const inner = match.slice(1, -1);

  if (/to\s+be\s+filled/i.test(inner)) return true;
  if (/\be\.g\./i.test(inner)) return true;

  // QC / SOP limit language in brackets is document copy, not a fill-in field.
  if (/not more than|not less than|\bNMT\b|\bNLT\b/i.test(inner)) return false;

  // Short tokens without label:value structure: [number], [fibers]
  if (
    !inner.includes(":") &&
    inner.length <= 32 &&
    /^[\w\s./-]+$/i.test(inner.trim())
  ) {
    return true;
  }

  return false;
}

function collectPlaceholderSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];

  BRACKET_SPAN_REGEX.lastIndex = 0;
  let bm: RegExpExecArray | null;
  while ((bm = BRACKET_SPAN_REGEX.exec(text)) !== null) {
    const seg = bm[0];
    if (!isActionablePlaceholderBracket(seg)) continue;

    spans.push({
      fromRel: bm.index,
      toRel: bm.index + seg.length,
      text: seg,
    });
  }

  return spans;
}

/**
 * Scans a Tiptap JSON document and returns all placeholders found within it.
 */
export function findPlaceholders(
  doc: JSONContent,
  section: SectionType,
  contentPath: string
): Placeholder[] {
  const placeholders: Placeholder[] = [];

  function walk(node: JSONContent, pos: number): number {
    if (node.type === "text") {
      const text = node.text ?? "";
      const spans = collectPlaceholderSpans(text);

      for (const s of spans) {
        placeholders.push({
          id: `${section}-${contentPath}-${pos + s.fromRel}`,
          section,
          contentPath,
          fromPos: pos + s.fromRel,
          toPos: pos + s.toRel,
          text: s.text,
        });
      }

      return pos + text.length;
    }

    if (node.type === "doc") {
      let cursor = pos;
      for (const ch of node.content ?? []) {
        cursor = walk(ch, cursor);
      }
      return cursor;
    }

    let cursor = pos + 1;
    if (node.content?.length) {
      for (const ch of node.content) {
        cursor = walk(ch, cursor);
      }
    }
    return cursor + 1;
  }

  if (doc) {
    walk(doc, 0);
  }

  return placeholders;
}
