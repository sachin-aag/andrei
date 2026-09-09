import type { JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { SectionType } from "@/db/schema";
import {
  isCitationShapedBracket,
  NUMERIC_ONLY_BRACKET,
} from "@/lib/placeholders/citation-bracket";
import { clipBracketPlaceholderText } from "@/lib/text/bracket-span";

export type Placeholder = {
  id: string;
  section: SectionType;
  contentPath: string;
  fromPos: number;
  toPos: number;
  text: string;
};

export function placeholderIdForField(
  section: SectionType,
  contentPath: string,
  fromPos: number
): string {
  return `${section}-${contentPath}-${fromPos}`;
}

export function fromPosFromPlaceholderId(
  id: string,
  section: SectionType,
  contentPath: string
): number | null {
  const prefix = `${section}-${contentPath}-`;
  if (!id.startsWith(prefix)) return null;
  const n = Number(id.slice(prefix.length));
  return Number.isFinite(n) ? n : null;
}

/**
 * Legacy square-bracket placeholders (`[Batch No.: <to be filled>]`) plus
 * canonical angle-bracket tokens (`<batch number>`, `<to be filled>`).
 */
export const PLACEHOLDER_REGEX =
  /\[[^\]]*(?:<\s*)?to be filled(?:\s*>)?[^\]]*\]|<[^<>]+>/gi;

/** Any `[...]` span; paired with exclusions in `collectPlaceholderSpans`. */
export const BRACKET_SPAN_REGEX = /\[[^\]]+\]/g;

/** Any `<...>` span; inner `<to be filled>` inside `[...]` is skipped. */
export const ANGLE_SPAN_REGEX = /<[^<>]+>/g;

/** Citation-style `[12]` — not treated as an editable placeholder. */
export { NUMERIC_ONLY_BRACKET };

/**
 * Max length for a placeholder label (inner text of `<label>` / before
 * `: <to be filled>` on the legacy square form).
 * Shared by the scanner and the suggestion/document normalizer so they cannot drift.
 */
export const MAX_PLACEHOLDER_LABEL_LENGTH = 40;

/** Structural HTML tags — not Placeholders-panel labels (`<date>` is allowed). */
const HTML_TAG_NAMES = new Set([
  "a",
  "article",
  "aside",
  "audio",
  "b",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "col",
  "colgroup",
  "div",
  "em",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "li",
  "main",
  "math",
  "mi",
  "mn",
  "mo",
  "mrow",
  "nav",
  "ol",
  "option",
  "p",
  "path",
  "pre",
  "script",
  "section",
  "select",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "sup",
  "svg",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
  "video",
]);

export function isLikelyHtmlTag(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed || trimmed.startsWith("!") || trimmed.startsWith("?")) return true;
  if (trimmed.includes("=") || trimmed.endsWith("/")) return true;
  const name = trimmed.replace(/^\//, "").split(/[\s/]/, 1)[0]?.toLowerCase() ?? "";
  return HTML_TAG_NAMES.has(name);
}

type TextSpan = { fromRel: number; toRel: number; text: string };

/**
 * True when `[...]` is guidance the author or AI should replace—not static prose
 * such as SOP acceptance criteria that happen to be wrapped in brackets on import.
 */
export function isActionablePlaceholderBracket(match: string): boolean {
  if (!/^\[[^\]]+\]$/.test(match)) return false;
  if (NUMERIC_ONLY_BRACKET.test(match)) return false;
  // Document citations (`[file.pdf]`, `[name, p. N]`, `[Appendix B]`,
  // `[Appendix B DV Report 790-00134R(RevU)]`, including mistaken
  // `[cite: <to be filled>]`) are never Placeholders-panel tokens.
  // CUID2 attachment ids the model copied from the document index are cites.
  if (isCitationShapedBracket(match)) return false;

  const inner = match.slice(1, -1);

  // Failed legacy equation import — not a fill-in field.
  if (/^formula$/i.test(inner.trim())) return false;

  if (/to\s+be\s+filled/i.test(inner)) return true;
  if (/\be\.g\./i.test(inner)) return true;

  // QC / SOP limit language in brackets is document copy, not a fill-in field.
  if (/not more than|not less than|\bNMT\b|\bNLT\b/i.test(inner)) return false;

  // Guidance-only labels without `: <to be filled>` — e.g. `[number]`,
  // `[equipment ID]`, `[Personnel Name(s)]`. Legacy square form; new drafts
  // use `<number>`. Cap length so long bracketed prose is not treated as a
  // fill-in field. Parentheses cover plural markers like `(s)`.
  if (
    !inner.includes(":") &&
    inner.length <= MAX_PLACEHOLDER_LABEL_LENGTH &&
    /^[\w\s./'()-]+$/i.test(inner.trim())
  ) {
    return true;
  }

  return false;
}

/**
 * Fill-in labels inside `<...>`, including a hint after a colon
 * (`<container format: Vial / Cartridge>`). Square-bracket labels still
 * treat `:` as the legacy `: <to be filled>` separator, not a hint.
 */
const ANGLE_PLACEHOLDER_LABEL = /^[\w\s./':,|-]+$/i;

/**
 * True when `<...>` is a fill-in token (`<batch number>`, `<to be filled>`,
 * `<container format: Vial / Cartridge>`), not an HTML tag and not the
 * inner `<to be filled>` of a square bracket.
 */
export function isActionablePlaceholderAngle(match: string): boolean {
  if (!/^<[^<>]+>$/.test(match)) return false;
  const inner = match.slice(1, -1);
  if (isLikelyHtmlTag(inner)) return false;
  if (/^\s*\d+\s*$/.test(inner)) return false;
  if (/^formula$/i.test(inner.trim())) return false;
  if (/not more than|not less than|\bNMT\b|\bNLT\b/i.test(inner)) return false;
  if (/to\s+be\s+filled/i.test(inner)) return true;
  if (/\be\.g\./i.test(inner)) return true;

  const trimmed = inner.trim();
  return (
    trimmed.length <= MAX_PLACEHOLDER_LABEL_LENGTH &&
    ANGLE_PLACEHOLDER_LABEL.test(trimmed)
  );
}

export function collectPlaceholderSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  const squareRanges: Array<{ from: number; to: number }> = [];

  BRACKET_SPAN_REGEX.lastIndex = 0;
  let bm: RegExpExecArray | null;
  while ((bm = BRACKET_SPAN_REGEX.exec(text)) !== null) {
    const raw = bm[0];
    squareRanges.push({ from: bm.index, to: bm.index + raw.length });
    if (!isActionablePlaceholderBracket(raw)) continue;

    const seg = clipBracketPlaceholderText(raw);
    spans.push({
      fromRel: bm.index,
      toRel: bm.index + seg.length,
      text: seg,
    });
  }

  ANGLE_SPAN_REGEX.lastIndex = 0;
  let am: RegExpExecArray | null;
  while ((am = ANGLE_SPAN_REGEX.exec(text)) !== null) {
    const raw = am[0];
    const from = am.index;
    const to = from + raw.length;
    if (squareRanges.some((range) => from >= range.from && to <= range.to)) {
      continue;
    }
    if (!isActionablePlaceholderAngle(raw)) continue;
    spans.push({
      fromRel: from,
      toRel: to,
      text: raw,
    });
  }

  return spans.toSorted((a, b) => a.fromRel - b.fromRel);
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
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (remaining < chunk.text.length) {
      return chunk.pmStart + remaining;
    }
    if (remaining === chunk.text.length) {
      const next = chunks[i + 1];
      if (next) return next.pmStart;
      return chunk.pmStart + remaining;
    }
    remaining -= chunk.text.length;
  }
  const last = chunks[chunks.length - 1];
  return last ? last.pmStart + last.text.length : 0;
}

function scanPmBlockForPlaceholders(
  block: PMNode,
  blockPos: number,
  section: SectionType,
  contentPath: string
): Placeholder[] {
  const chunks: TextChunk[] = [];
  block.forEach((child, offset) => {
    if (child.isText && child.text) {
      chunks.push({ pmStart: blockPos + 1 + offset, text: child.text });
    }
  });
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

/** Scan a live ProseMirror doc (preserves per–text-node boundaries). */
export function findPlaceholdersInPmDoc(
  doc: PMNode,
  section: SectionType,
  contentPath: string
): Placeholder[] {
  const placeholders: Placeholder[] = [];
  const blockNames = new Set([
    "paragraph",
    "heading",
    "tableCell",
    "tableHeader",
    "listItem",
    "blockquote",
  ]);

  doc.descendants((node, pos) => {
    if (!blockNames.has(node.type.name)) return true;
    placeholders.push(
      ...scanPmBlockForPlaceholders(node, pos, section, contentPath)
    );
    // Keep descending: container blocks (blockquote, listItem, tableCell, …)
    // hold their text inside nested paragraphs. scanPmBlockForPlaceholders only
    // reads direct text children, so each leaf block is scanned exactly once and
    // nested placeholders would be missed if we stopped here.
    return true;
  });

  return placeholders;
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

/** Scan a plain-text field (textarea) for placeholders. Positions are UTF-16 offsets. */
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
