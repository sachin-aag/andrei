import type { JSONContent } from "@tiptap/core";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import {
  listItemParagraph,
  listItemParagraphs,
  parseListLine,
  type ListStyle,
} from "@/lib/tiptap/list-style";

/** Empty Tiptap document (single empty paragraph). */
export function emptyDoc(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

/** Internal marker for Word soft line breaks preserved from mammoth markdown. */
export const MAMMOTH_SOFT_BREAK = "\u0001";

function lineWithoutSoftBreak(line: string): string {
  return line.replace(new RegExp(`${MAMMOTH_SOFT_BREAK}$`), "");
}

const LIST_ITEM_CONTINUATION_RE = /^Ans\.|^Answer:/i;

/** Lines after a list marker that belong to the same item (e.g. "Ans." under a 5-Why). */
function collectListItemContinuation(lines: string[], startIndex: number): {
  paragraphs: string[];
  nextIndex: number;
} {
  const paragraphs: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const raw = lineWithoutSoftBreak(lines[i]!);
    if (!raw.trim()) {
      i++;
      continue;
    }
    if (parseListLine(raw)) break;
    if (!LIST_ITEM_CONTINUATION_RE.test(raw.trim())) break;
    paragraphs.push(raw.trim());
    i++;
  }
  return { paragraphs, nextIndex: i };
}

/** Convert plain-text narrative to a doc, grouping markdown-style list lines. */
export function linesToDoc(s: string): JSONContent {
  if (!s.trim()) return emptyDoc();

  const lines = s.split(/\n/);
  const content: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const parsed = parseListLine(lineWithoutSoftBreak(line));

    if (parsed?.kind === "ordered") {
      const items: JSONContent[] = [];
      while (i < lines.length) {
        while (i < lines.length && !lineWithoutSoftBreak(lines[i]!).trim()) i++;
        if (i >= lines.length) break;

        const next = parseListLine(lineWithoutSoftBreak(lines[i]!));
        if (next?.kind !== "ordered") break;

        const paragraphs = [next.text];
        i++;
        const continuation = collectListItemContinuation(lines, i);
        paragraphs.push(...continuation.paragraphs);
        i = continuation.nextIndex;

        items.push(
          paragraphs.length === 1
            ? listItemParagraph(paragraphs[0]!)
            : listItemParagraphs(paragraphs)
        );
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    if (parsed?.kind === "bullet") {
      const listStyle = parsed.listStyle;
      const items: JSONContent[] = [];
      while (i < lines.length) {
        while (i < lines.length && !lineWithoutSoftBreak(lines[i]!).trim()) i++;
        if (i >= lines.length) break;

        const next = parseListLine(lineWithoutSoftBreak(lines[i]!));
        if (next?.kind !== "bullet" || next.listStyle !== listStyle) break;

        const paragraphs = [next.text];
        i++;
        const continuation = collectListItemContinuation(lines, i);
        paragraphs.push(...continuation.paragraphs);
        i = continuation.nextIndex;

        items.push(
          paragraphs.length === 1
            ? listItemParagraph(paragraphs[0]!)
            : listItemParagraphs(paragraphs)
        );
      }
      content.push({
        type: "bulletList",
        attrs: { listStyle },
        content: items,
      });
      continue;
    }

    if (line.endsWith(MAMMOTH_SOFT_BREAK)) {
      const inline: JSONContent[] = [];
      while (i < lines.length) {
        const current = lines[i]!;
        if (current.endsWith(MAMMOTH_SOFT_BREAK)) {
          const text = current.slice(0, -MAMMOTH_SOFT_BREAK.length);
          if (text) inline.push({ type: "text", text });
          inline.push({ type: "hardBreak" });
          i++;
          continue;
        }
        if (current) inline.push({ type: "text", text: current });
        i++;
        break;
      }
      if (inline.at(-1)?.type === "hardBreak") inline.pop();
      content.push({
        type: "paragraph",
        content: inline.length > 0 ? inline : [],
      });
      continue;
    }

    content.push({
      type: "paragraph",
      content: line.length ? [{ type: "text", text: line }] : [],
    });
    i++;
  }

  return { type: "doc", content };
}

/** Convert legacy plain-text narrative to a minimal doc (paragraphs by line breaks). */
export function legacyStringToDoc(s: string): JSONContent {
  return linesToDoc(s);
}

/**
 * Coerce nodes the section editor schema can't render into supported ones.
 * The editor registers no heading node (StarterKit `heading: false`), so a
 * stray `heading` (e.g. persisted by an older redraft) would make ProseMirror
 * reject the entire doc and render blank. Convert it to a bold paragraph.
 */
function coerceUnsupportedNodes(node: JSONContent): JSONContent {
  if (node.type === "heading") {
    return {
      type: "paragraph",
      content: (node.content ?? []).map((child) => {
        if (child.type !== "text") return coerceUnsupportedNodes(child);
        const marks = child.marks ?? [];
        return marks.some((m) => m.type === "bold")
          ? child
          : { ...child, marks: [...marks, { type: "bold" }] };
      }),
    };
  }
  if (node.content?.length) {
    return { ...node, content: node.content.map(coerceUnsupportedNodes) };
  }
  return node;
}

/** Normalize DB/client value to JSONContent (handles legacy strings). */
export function normalizeRichField(v: unknown): JSONContent {
  if (v && typeof v === "object" && "type" in v && (v as JSONContent).type === "doc") {
    return coerceUnsupportedNodes(v as JSONContent);
  }
  if (typeof v === "string") {
    return legacyStringToDoc(v);
  }
  return emptyDoc();
}

/**
 * How tables are serialized when converting a Tiptap doc to text.
 * - `pipe`: legacy "cell | cell" rows, used by export round-trip + diffing.
 * - `markdown`: GitHub-flavored markdown table with header separator and
 *   merged cells expanded (the merged value is repeated across every
 *   rowspan/colspan position). Preferred for LLM prompts where structure
 *   matters and the model is well-trained on markdown tables.
 */
export type RichTextTableFormat = "pipe" | "markdown";

export type RichJsonToPlainTextOptions = {
  tableFormat?: RichTextTableFormat;
};

/** Plain text for export / AI (walks text nodes; paragraphs → newlines). */
export function richJsonToPlainText(
  doc: JSONContent | undefined | null,
  options: RichJsonToPlainTextOptions = {},
): string {
  if (!doc) return "";
  const tableFormat: RichTextTableFormat = options.tableFormat ?? "pipe";
  const parts: string[] = [];

  function walk(node: JSONContent, blockSep: string) {
    if (node.type === "text") {
      parts.push(node.text ?? "");
      return;
    }
    if (node.type === "hardBreak") {
      parts.push("\n");
      return;
    }
    if (node.type === "imageInline") {
      const alt = (node.attrs?.alt as string | undefined)?.trim();
      parts.push(`[image${alt ? `: ${alt}` : ""}]`);
      return;
    }
    if (node.type === "mathInline" || node.type === "mathBlock") {
      parts.push("[equation]");
      return;
    }
    const inner = node.content;
    if (!inner?.length) return;
    if (node.type === "paragraph") {
      for (const ch of inner) walk(ch, "");
      parts.push(blockSep);
      return;
    }
    if (node.type === "heading") {
      for (const ch of inner) walk(ch, "");
      parts.push("\n");
      return;
    }
    if (node.type === "table") {
      if (tableFormat === "markdown") {
        const md = renderTableAsMarkdown(node);
        if (md) parts.push(md + "\n\n");
      } else {
        for (const row of inner) walk(row, "");
        parts.push("\n");
      }
      return;
    }
    if (node.type === "tableRow") {
      const cells: string[] = [];
      for (const cell of inner) {
        const before = parts.length;
        walk(cell, "");
        // Collect text added by the cell's children
        const cellText = parts.splice(before).join("").trim();
        cells.push(cellText);
      }
      parts.push(cells.join(" | ") + "\n");
      return;
    }
    if (node.type === "tableCell" || node.type === "tableHeader") {
      for (const ch of inner) walk(ch, "");
      return;
    }
    if (node.type === "doc") {
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i]!;
        const isBlock = ["paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList", "table"].includes(
          ch.type ?? ""
        );
        walk(ch, isBlock ? "\n\n" : "");
      }
      return;
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      const listStyle = (node.attrs?.listStyle as ListStyle | undefined) ?? "disc";
      let index = 1;
      for (const item of inner) {
        if (node.type === "orderedList") {
          const itemText = extractListItemPlainText(item);
          parts.push(`${index}. ${itemText}\n`);
          index++;
        } else {
          const prefix = listStyle === "dash" ? "- " : "• ";
          const itemText = extractListItemPlainText(item);
          parts.push(`${prefix}${itemText}\n`);
        }
      }
      parts.push(blockSep === "\n\n" ? "\n" : "");
      return;
    }
    if (node.type === "listItem") {
      for (const ch of inner) walk(ch, "\n");
      return;
    }
    for (const ch of inner) walk(ch, blockSep);
  }

  walk(doc, "\n");
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractListItemPlainText(item: JSONContent): string {
  const chunks: string[] = [];
  function walk(node: JSONContent) {
    if (node.type === "text") {
      chunks.push(node.text ?? "");
      return;
    }
    for (const ch of node.content ?? []) walk(ch);
  }
  for (const ch of item.content ?? []) walk(ch);
  return chunks.join("").trim();
}

/**
 * Render a Tiptap `table` node as a GitHub-flavored markdown table.
 *
 * - Computes the logical column count from the widest row (sum of colspans).
 * - Expands merged cells by repeating the merged value into every covered
 *   position. This is intentional: it makes the data unambiguous for LLMs
 *   that don't reason about rowspan attributes (e.g. when a single "Total
 *   duration" cell merges over five sensor rows, every sensor row shows the
 *   same duration value).
 * - Cell text is collapsed to a single line; intra-cell paragraph breaks
 *   are joined with " / " so the markdown row stays valid.
 */
function renderTableAsMarkdown(tableNode: JSONContent): string {
  const rows = tableNode.content ?? [];
  if (rows.length === 0) return "";

  let colCount = 0;
  for (const row of rows) {
    let rowCols = 0;
    for (const cell of row.content ?? []) {
      rowCols += getSpan(cell, "colspan");
    }
    if (rowCols > colCount) colCount = rowCols;
  }
  if (colCount === 0) return "";

  const grid: (string | null)[][] = Array.from({ length: rows.length }, () =>
    Array<string | null>(colCount).fill(null)
  );

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r]?.content ?? [];
    let c = 0;
    for (const cell of cells) {
      while (c < colCount && grid[r]![c] !== null) c++;
      if (c >= colCount) break;
      const cs = getSpan(cell, "colspan");
      const rs = getSpan(cell, "rowspan");
      const value = collapseCellText(cell);
      for (let dr = 0; dr < rs && r + dr < rows.length; dr++) {
        for (let dc = 0; dc < cs && c + dc < colCount; dc++) {
          grid[r + dr]![c + dc] = value;
        }
      }
      c += cs;
    }
  }

  const lines: string[] = [];
  const header = grid[0]!.map((v) => escapeMarkdownCell(v ?? ""));
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r]!.map((v) => escapeMarkdownCell(v ?? ""));
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines.join("\n");
}

function getSpan(cell: JSONContent, key: "colspan" | "rowspan"): number {
  const raw = (cell.attrs as { colspan?: number; rowspan?: number } | undefined)?.[key];
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 1) return Math.floor(raw);
  return 1;
}

function collapseCellText(cell: JSONContent): string {
  const pieces: string[] = [];
  let currentParagraph: string[] = [];
  function flushParagraph() {
    const joined = currentParagraph.join("").replace(/\s+/g, " ").trim();
    if (joined) pieces.push(joined);
    currentParagraph = [];
  }
  function walk(node: JSONContent) {
    if (node.type === "text") {
      currentParagraph.push(node.text ?? "");
      return;
    }
    if (node.type === "hardBreak") {
      currentParagraph.push(" ");
      return;
    }
    if (node.type === "paragraph") {
      flushParagraph();
      for (const ch of node.content ?? []) walk(ch);
      flushParagraph();
      return;
    }
    for (const ch of node.content ?? []) walk(ch);
  }
  for (const ch of cell.content ?? []) walk(ch);
  flushParagraph();
  return pieces.join(" / ");
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

/**
 * Append `paragraph` as a new paragraph at the end of `doc`. The paragraph may
 * contain newlines, in which case each line becomes its own paragraph.
 */
export function appendParagraphsToDoc(
  doc: JSONContent,
  paragraph: string
): JSONContent {
  if (!paragraph.trim()) return doc;
  const lines = paragraph.split(/\n/);
  const nodes: JSONContent[] = lines.map((line) => ({
    type: "paragraph",
    content: line.length ? [{ type: "text", text: line }] : [],
  }));
  if (doc.type !== "doc") return doc;
  return {
    ...doc,
    content: [...(doc.content ?? []), ...nodes],
  };
}

function isBlankParagraph(node: JSONContent): boolean {
  if (node.type !== "paragraph") return false;
  return (node.content ?? []).every(
    (child) => child.type === "text" && !(child.text ?? "").trim()
  );
}

/**
 * Prepend `nodes` before the existing content of `doc`. Blank leading
 * paragraphs are dropped so prepending into an empty doc does not leave a
 * stray blank line in the middle.
 */
export function prependNodesToDoc(
  doc: JSONContent,
  nodes: JSONContent[]
): JSONContent {
  if (nodes.length === 0 || doc.type !== "doc") return doc;
  const existing = [...(doc.content ?? [])];
  while (existing.length > 0 && isBlankParagraph(existing[0]!)) existing.shift();
  return { ...doc, content: [...nodes, ...existing] };
}

/** Remove track-change marks from a doc (engineer draft cleanup; keeps manager review marks elsewhere). */
export function stripSuggestionMarksFromDoc(doc: JSONContent): JSONContent {
  function visit(node: JSONContent): JSONContent {
    if (node.type === "text" && node.marks?.length) {
      const marks = node.marks.filter(
        (m) =>
          m.type !== suggestionInsertMarkName && m.type !== suggestionDeleteMarkName
      );
      const next: JSONContent = { ...node };
      if (marks.length > 0) next.marks = marks;
      else delete next.marks;
      return next;
    }
    if (node.content?.length) {
      return {
        ...node,
        content: node.content.map(visit),
      };
    }
    return node;
  }
  return visit(doc);
}
