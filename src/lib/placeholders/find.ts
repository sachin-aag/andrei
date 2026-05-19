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

export function collectPlaceholderSpans(text: string): TextSpan[] {
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

const BLOCK_CONTAINER_TYPES = new Set([
  "paragraph",
  "heading",
  "tableCell",
  "tableHeader",
  "listItem",
  "blockquote",
]);

type TextChunk = { pmStart: number; text: string };

function collectTextChunks(node: JSONContent, pos: number): { chunks: TextChunk[]; end: number } {
  if (node.type === "text") {
    const text = node.text ?? "";
    return {
      chunks: text.length > 0 ? [{ pmStart: pos, text }] : [],
      end: pos + text.length,
    };
  }

  if (node.type === "doc") {
    let cursor = pos;
    const chunks: TextChunk[] = [];
    for (const ch of node.content ?? []) {
      const inner = collectTextChunks(ch, cursor);
      chunks.push(...inner.chunks);
      cursor = inner.end;
    }
    return { chunks, end: cursor };
  }

  let cursor = pos + 1;
  const chunks: TextChunk[] = [];
  for (const ch of node.content ?? []) {
    const inner = collectTextChunks(ch, cursor);
    chunks.push(...inner.chunks);
    cursor = inner.end;
  }
  return { chunks, end: cursor + 1 };
}

function pmOffsetToPos(chunks: TextChunk[], offset: number): number {
  let remaining = offset;
  for (const chunk of chunks) {
    if (remaining <= chunk.text.length) {
      return chunk.pmStart + remaining;
    }
    remaining -= chunk.text.length;
  }
  const last = chunks[chunks.length - 1];
  return last ? last.pmStart + last.text.length : 0;
}

function scanBlockForPlaceholders(
  block: JSONContent,
  blockContentStart: number,
  section: SectionType,
  contentPath: string
): Placeholder[] {
  const { chunks } = collectTextChunks(block, blockContentStart);
  if (chunks.length === 0) return [];

  const flat = chunks.map((c) => c.text).join("");
  const spans = collectPlaceholderSpans(flat);

  return spans.map((s) => {
    const fromPos = pmOffsetToPos(chunks, s.fromRel);
    const toPos = pmOffsetToPos(chunks, s.toRel);
    return {
      id: `${section}-${contentPath}-${fromPos}`,
      section,
      contentPath,
      fromPos,
      toPos,
      text: s.text,
    };
  });
}

/**
 * Scans a Tiptap JSON document and returns all placeholders found within it.
 * Scans flattened text per block so placeholders split across text nodes still match.
 */
export function findPlaceholders(
  doc: JSONContent,
  section: SectionType,
  contentPath: string
): Placeholder[] {
  const placeholders: Placeholder[] = [];

  function walk(node: JSONContent, pos: number): number {
    if (node.type === "text") {
      return pos + (node.text?.length ?? 0);
    }

    if (node.type === "doc") {
      let cursor = pos;
      for (const ch of node.content ?? []) {
        cursor = walk(ch, cursor);
      }
      return cursor;
    }

    const contentStart = pos + 1;
    if (BLOCK_CONTAINER_TYPES.has(node.type ?? "")) {
      placeholders.push(
        ...scanBlockForPlaceholders(node, contentStart, section, contentPath)
      );
    }

    let cursor = contentStart;
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

/** Scan a plain-text field (textarea) for bracket placeholders. Positions are UTF-16 offsets. */
export function findPlaceholdersInPlainText(
  text: string,
  section: SectionType,
  contentPath: string
): Placeholder[] {
  if (!text.trim()) return [];

  return collectPlaceholderSpans(text).map((s) => ({
    id: `${section}-${contentPath}-${s.fromRel}`,
    section,
    contentPath,
    fromPos: s.fromRel,
    toPos: s.toRel,
    text: s.text,
  }));
}
