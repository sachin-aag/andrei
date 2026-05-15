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

function collectPlaceholderSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];

  PLACEHOLDER_REGEX.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = PLACEHOLDER_REGEX.exec(text)) !== null) {
    spans.push({
      fromRel: tm.index,
      toRel: tm.index + tm[0].length,
      text: tm[0],
    });
  }

  BRACKET_SPAN_REGEX.lastIndex = 0;
  let bm: RegExpExecArray | null;
  while ((bm = BRACKET_SPAN_REGEX.exec(text)) !== null) {
    const seg = bm[0];
    if (NUMERIC_ONLY_BRACKET.test(seg)) continue;

    const fromRel = bm.index;
    const toRel = bm.index + seg.length;
    if (spans.some((s) => s.fromRel <= fromRel && s.toRel >= toRel)) continue;

    spans.push({ fromRel, toRel, text: seg });
  }

  spans.sort((a, b) => a.fromRel - b.fromRel || b.toRel - a.toRel);
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
