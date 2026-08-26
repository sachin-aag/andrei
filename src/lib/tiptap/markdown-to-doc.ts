import type { JSONContent } from "@tiptap/core";
import {
  isCitationListHeading,
  isEmptyParagraphBlock,
} from "@/lib/suggestions/citations-at-end";
import { parseListLine } from "@/lib/tiptap/list-style";

export type MarkdownToDocOptions = {
  /** Emit TipTap `heading` nodes instead of bold paragraphs. Generic documents only. */
  headingNodes?: boolean;
};

const ATX_HEADING_RE = /^(#{1,3})\s+(.*)$/;

/**
 * CommonMark-ish emphasis: no space after the opener or before the closer.
 * `* item` bullets are handled at line level; `2 * 3` stays literal.
 */
const INLINE_MARKDOWN_SPLIT_RE =
  /(\*\*[^*]+\*\*|(?<!\*)\*(?!\s)[^*]+?(?<!\s)\*(?!\*)|(?<!_)_(?!\s)[^_]+?(?<!\s)_(?!_))/g;

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\s)([^*]+?)(?<!\s)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_(?!\s)([^_]+?)(?<!\s)_(?!_)/g, "$1");
}

/** ATX `#`–`###` line → heading node or bold paragraph. */
export function atxHeadingParagraph(
  text: string,
  options?: MarkdownToDocOptions
): JSONContent | null {
  const heading = ATX_HEADING_RE.exec(text.trim());
  if (!heading) return null;
  const headingText = stripInlineMarkdown(heading[2]!);
  if (!headingText) return null;
  const level = Math.min(3, heading[1]!.length);
  if (options?.headingNodes) {
    return {
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text: headingText }],
    };
  }
  return {
    type: "paragraph",
    content: [{ type: "text", text: headingText, marks: [{ type: "bold" }] }],
  };
}

function paragraphPlainText(node: JSONContent): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === "text") return child.text ?? "";
      if (child.type === "hardBreak") return "\n";
      return "";
    })
    .join("");
}

function paragraphIsPlainInline(node: JSONContent): boolean {
  return (node.content ?? []).every(
    (child) => child.type === "text" || child.type === "hardBreak"
  );
}

/**
 * Turn persisted paragraphs that still start with `#` / `##` / `###` into the
 * same bold paragraphs `markdownToDoc` emits, so Improve/Control don't show
 * literal hashes.
 */
export function promoteAtxHeadingsInDoc(
  doc: JSONContent,
  options?: MarkdownToDocOptions
): JSONContent {
  function visit(node: JSONContent): JSONContent {
    if (node.type === "paragraph" && paragraphIsPlainInline(node)) {
      const promoted = atxHeadingParagraph(paragraphPlainText(node), options);
      if (promoted) return promoted;
    }
    if (node.content?.length) {
      return { ...node, content: node.content.map(visit) };
    }
    return node;
  }
  return visit(doc);
}

/**
 * Deterministic GFM-subset markdown → TipTap doc converter for AI redrafts.
 *
 * Supported (matches what the drafting prompt allows the model to emit):
 * - paragraphs (one line = one paragraph)
 * - headings `#` … `###` → bold paragraph by default (section editors have
 *   no heading node). Pass `{ headingNodes: true }` for generic documents.
 * - bullet (`- `, `* `) and ordered (`1. `) lists
 * - GFM tables (first row = header)
 * - `**bold**`, `*italic*`, and `_italic_` inline emphasis
 *
 * Anything else is kept as literal text. No HTML, no fuzziness.
 */
export function markdownToDoc(
  markdown: string,
  options?: MarkdownToDocOptions
): JSONContent {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const content: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (isTableRow(trimmed) && isTableSeparator(lines[i + 1]?.trim() ?? "")) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i]!.trim())) {
        tableLines.push(lines[i]!.trim());
        i++;
      }
      const table = parseTable(tableLines);
      if (table) content.push(table);
      continue;
    }

    const heading = atxHeadingParagraph(trimmed, options);
    if (heading) {
      content.push(heading);
      i++;
      continue;
    }

    const listStart = parseListItemLine(trimmed);
    if (listStart) {
      const items: JSONContent[] = [];
      const kind = listStart.kind;
      while (i < lines.length) {
        const next = parseListItemLine(lines[i]!.trim());
        if (!next || next.kind !== kind) break;
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInline(next.text) }],
        });
        i++;
      }
      content.push(
        kind === "ordered"
          ? { type: "orderedList", content: items }
          : { type: "bulletList", attrs: { listStyle: "dash" }, content: items }
      );
      continue;
    }

    if (isCitationListHeading(trimmed)) {
      const last = content[content.length - 1];
      if (last && !isEmptyParagraphBlock(last)) {
        content.push({ type: "paragraph" });
      }
    }
    content.push({ type: "paragraph", content: parseInline(trimmed) });
    i++;
  }

  if (content.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return { type: "doc", content };
}

/** Markdown image syntax (`![alt](url)`), including read_section ids like `narrative#1`. */
const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(\s*[^)]+?\s*\)/;

export function markdownHasImage(markdown: string): boolean {
  return MARKDOWN_IMAGE_RE.test(markdown);
}

/** Markdown containing a GFM table (used to route tables away from plain fields). */
export function markdownHasTable(markdown: string): boolean {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (isTableRow(lines[i]!.trim()) && isTableSeparator(lines[i + 1]!.trim())) {
      return true;
    }
  }
  return false;
}

/** Plain-text rendering of the same markdown subset (for plain string fields). */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => stripInlineMarkdown(line).replace(/^#{1,3}\s+/, ""))
    .join("\n")
    .trim();
}

function parseListItemLine(
  trimmed: string
): { kind: "ordered" | "bullet"; text: string } | null {
  // markdown `* item` bullets (parseListLine covers `- ` and ordered).
  const star = /^\*\s+(.*)$/.exec(trimmed);
  if (star) return { kind: "bullet", text: star[1] ?? "" };
  const parsed = parseListLine(trimmed);
  if (!parsed) return null;
  return { kind: parsed.kind === "ordered" ? "ordered" : "bullet", text: parsed.text };
}

function paragraphHasSuggestionMarks(node: JSONContent): boolean {
  return (node.content ?? []).some((child) =>
    (child.marks ?? []).some(
      (mark) =>
        mark.type === "suggestionInsert" || mark.type === "suggestionDelete"
    )
  );
}

/** True when a paragraph still stores markdown source (`###`, `**bold**`, `1. `). */
export function looksLikeLiteralMarkdown(text: string): boolean {
  if (ATX_HEADING_RE.test(text.trim())) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  return text.split("\n").some((line) => parseListItemLine(line.trim()) != null);
}

function isHydrateableMarkdownParagraph(node: JSONContent): boolean {
  if (node.type !== "paragraph" || !paragraphIsPlainInline(node)) return false;
  if (paragraphHasSuggestionMarks(node)) return false;
  return looksLikeLiteralMarkdown(paragraphPlainText(node));
}

function isBlankPlainParagraph(node: JSONContent): boolean {
  return (
    node.type === "paragraph" &&
    paragraphIsPlainInline(node) &&
    !paragraphHasSuggestionMarks(node) &&
    !paragraphPlainText(node).trim()
  );
}

function hydrateBlockArray(
  nodes: JSONContent[],
  options?: MarkdownToDocOptions
): JSONContent[] {
  const out: JSONContent[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i]!;
    if (isHydrateableMarkdownParagraph(node)) {
      const texts: string[] = [];
      while (i < nodes.length) {
        const current = nodes[i]!;
        if (isHydrateableMarkdownParagraph(current)) {
          texts.push(paragraphPlainText(current));
          i++;
          continue;
        }
        if (texts.length > 0 && isBlankPlainParagraph(current)) {
          texts.push("");
          i++;
          continue;
        }
        break;
      }
      while (texts.length > 0 && !texts[texts.length - 1]!.trim()) {
        texts.pop();
      }
      const converted = markdownToDoc(texts.join("\n"), options);
      out.push(...(converted.content ?? []));
      continue;
    }
    out.push(hydrateNode(node, options));
    i++;
  }
  return out;
}

function hydrateNode(
  node: JSONContent,
  options?: MarkdownToDocOptions
): JSONContent {
  if (node.type !== "paragraph" && node.content?.length) {
    return { ...node, content: hydrateBlockArray(node.content, options) };
  }
  return node;
}

/**
 * Chat / import can persist a whole markdown blob as one (or a few) paragraphs
 * with literal `###`, `**bold**`, and `1. ` markers. Turn those into the same
 * TipTap nodes `markdownToDoc` emits so Improve/Control render instead of
 * showing hashes and asterisks.
 */
export function hydrateLiteralMarkdownInDoc(
  doc: JSONContent,
  options?: MarkdownToDocOptions
): JSONContent {
  if (doc.type === "doc") {
    return { ...doc, content: hydrateBlockArray(doc.content ?? [], options) };
  }
  return hydrateNode(doc, options);
}

function withExtraMarks(
  marks: JSONContent["marks"] | undefined,
  extraMarks: JSONContent["marks"] | undefined
): JSONContent["marks"] | undefined {
  if (!extraMarks?.length) return marks;
  if (!marks?.length) return extraMarks;
  return [...extraMarks, ...marks];
}

/**
 * `**bold**` / `*italic*` / `_italic_` → marked text nodes; everything else
 * literal. `extraMarks` (e.g. a pending suggestion mark) is applied to every
 * node so a rich insert can be both highlighted and italicized.
 */
export function inlineMarkdownToTextNodes(
  text: string,
  extraMarks?: JSONContent["marks"]
): JSONContent[] {
  const nodes: JSONContent[] = [];
  const parts = text.split(INLINE_MARKDOWN_SPLIT_RE);
  for (const part of parts) {
    if (!part) continue;
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      nodes.push({
        type: "text",
        text: bold[1]!,
        marks: withExtraMarks([{ type: "bold" }], extraMarks),
      });
      continue;
    }
    const italicStar = /^\*(?!\s)([^*]+?)(?<!\s)\*$/.exec(part);
    if (italicStar) {
      nodes.push({
        type: "text",
        text: italicStar[1]!,
        marks: withExtraMarks([{ type: "italic" }], extraMarks),
      });
      continue;
    }
    const italicUnderscore = /^_(?!\s)([^_]+?)(?<!\s)_$/.exec(part);
    if (italicUnderscore) {
      nodes.push({
        type: "text",
        text: italicUnderscore[1]!,
        marks: withExtraMarks([{ type: "italic" }], extraMarks),
      });
      continue;
    }
    nodes.push({
      type: "text",
      text: part,
      marks: extraMarks?.length ? extraMarks : undefined,
    });
  }
  return nodes;
}

/** `**bold**` / `*italic*` / `_italic_` → marked text nodes; everything else literal. */
function parseInline(text: string): JSONContent[] {
  return inlineMarkdownToTextNodes(text);
}

function isTableRow(trimmed: string): boolean {
  return trimmed.startsWith("|") && trimmed.length > 1;
}

function isTableSeparator(trimmed: string): boolean {
  if (!isTableRow(trimmed)) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c.trim()));
}

function splitTableRow(trimmed: string): string[] {
  let row = trimmed;
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  // Split on unescaped pipes, then unescape.
  return row
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function tableCellNode(type: "tableHeader" | "tableCell", text: string): JSONContent {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1 },
    content: [{ type: "paragraph", content: parseInline(text) }],
  };
}

function parseTable(tableLines: string[]): JSONContent | null {
  // tableLines[1] is the header separator; drop it.
  const dataLines = tableLines.filter((_, idx) => idx !== 1);
  if (dataLines.length === 0) return null;

  const rowsCells = dataLines.map(splitTableRow);
  const colCount = Math.max(...rowsCells.map((cells) => cells.length));
  if (colCount === 0) return null;

  const rows: JSONContent[] = rowsCells.map((cells, rowIdx) => {
    const type = rowIdx === 0 ? "tableHeader" : "tableCell";
    const padded = [...cells];
    while (padded.length < colCount) padded.push("");
    return {
      type: "tableRow",
      content: padded.map((cell) => tableCellNode(type, cell)),
    };
  });

  return { type: "table", content: rows };
}
