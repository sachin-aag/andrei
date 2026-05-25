import type { JSONContent } from "@tiptap/core";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import {
  listItemParagraph,
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

/** Convert plain-text narrative to a doc, grouping markdown-style list lines. */
export function linesToDoc(s: string): JSONContent {
  if (!s.trim()) return emptyDoc();

  const lines = s.split(/\n/);
  const content: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const parsed = parseListLine(line.replace(new RegExp(`${MAMMOTH_SOFT_BREAK}$`), ""));

    if (parsed?.kind === "ordered") {
      const items: JSONContent[] = [];
      while (i < lines.length) {
        const next = parseListLine(
          lines[i]!.replace(new RegExp(`${MAMMOTH_SOFT_BREAK}$`), "")
        );
        if (next?.kind !== "ordered") break;
        items.push(listItemParagraph(next.text));
        i++;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    if (parsed?.kind === "bullet") {
      const listStyle = parsed.listStyle;
      const items: JSONContent[] = [];
      while (i < lines.length) {
        const next = parseListLine(
          lines[i]!.replace(new RegExp(`${MAMMOTH_SOFT_BREAK}$`), "")
        );
        if (next?.kind !== "bullet" || next.listStyle !== listStyle) break;
        items.push(listItemParagraph(next.text));
        i++;
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

/** Normalize DB/client value to JSONContent (handles legacy strings). */
export function normalizeRichField(v: unknown): JSONContent {
  if (v && typeof v === "object" && "type" in v && (v as JSONContent).type === "doc") {
    return v as JSONContent;
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
 * Replace the first whitespace-tolerant occurrence of `anchorText` in `doc` with
 * `replacementText`. Returns `{ doc, replaced }`. If `anchorText` is empty or not
 * found, the original doc is returned unchanged with `replaced: false`.
 *
 * Whitespace tolerance: collapses runs of whitespace in both the anchor and the
 * doc text to a single space when searching, so minor newline/space drift between
 * what the model echoed and what's in the document still matches.
 */
export function replaceTextInDoc(
  doc: JSONContent,
  anchorText: string,
  replacementText: string
): { doc: JSONContent; replaced: boolean } {
  if (!anchorText || !anchorText.trim()) {
    return { doc, replaced: false };
  }

  // Collect every text node with its absolute offset in a flat plain-text
  // representation that does NOT include block separators (so anchors that
  // span paragraph breaks are matched too — we collapse whitespace anyway).
  type TextRef = { node: JSONContent; start: number; end: number };
  const refs: TextRef[] = [];
  let flat = "";

  function collect(node: JSONContent) {
    if (node.type === "text") {
      const text = node.text ?? "";
      const start = flat.length;
      flat += text;
      refs.push({ node, start, end: start + text.length });
      return;
    }
    if (node.content?.length) {
      for (let i = 0; i < node.content.length; i++) {
        collect(node.content[i]!);
        if (
          (node.type === "doc" || node.type === "paragraph" || node.type === "heading" || node.type === "tableCell" || node.type === "tableHeader") &&
          i < node.content.length - 1
        ) {
          // separator that won't survive whitespace collapse
          flat += " ";
        }
      }
    }
  }
  collect(doc);

  const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
  const collapsedAnchor = collapse(anchorText);
  if (!collapsedAnchor) return { doc, replaced: false };

  // Build a map from collapsed-flat indices back to original-flat indices.
  // We walk `flat`, skipping leading whitespace runs and condensing internal
  // ones, recording for each character in the collapsed string its origin
  // index in `flat`.
  const collapsedToOrig: number[] = [];
  let collapsed = "";
  let inSpace = true; // treat start as space so leading whitespace is dropped
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i]!;
    if (/\s/.test(ch)) {
      if (!inSpace) {
        collapsed += " ";
        collapsedToOrig.push(i);
        inSpace = true;
      }
    } else {
      collapsed += ch;
      collapsedToOrig.push(i);
      inSpace = false;
    }
  }
  // strip trailing space we may have added
  while (collapsed.endsWith(" ")) {
    collapsed = collapsed.slice(0, -1);
    collapsedToOrig.pop();
  }

  const idx = collapsed.indexOf(collapsedAnchor);
  if (idx === -1) return { doc, replaced: false };

  const origStart = collapsedToOrig[idx]!;
  const lastCollapsedIdx = idx + collapsedAnchor.length - 1;
  const origLastChar = collapsedToOrig[lastCollapsedIdx]!;
  const origEnd = origLastChar + 1;

  // Apply the replacement across the affected text nodes. The first overlapping
  // node keeps its prefix + the full replacement; intermediate nodes are
  // emptied; the last node keeps its suffix. Empty text nodes are dropped from
  // their parent's content during a final cleanup pass.
  const affected = refs.filter((r) => r.end > origStart && r.start < origEnd);
  if (affected.length === 0) return { doc, replaced: false };

  for (let i = 0; i < affected.length; i++) {
    const r = affected[i]!;
    const localStart = Math.max(0, origStart - r.start);
    const localEnd = Math.min(r.end - r.start, origEnd - r.start);
    const original = r.node.text ?? "";
    if (i === 0) {
      r.node.text = original.slice(0, localStart) + replacementText + original.slice(localEnd);
    } else {
      r.node.text = original.slice(0, localStart) + original.slice(localEnd);
    }
  }

  // Drop now-empty text nodes from their parents.
  function prune(node: JSONContent): JSONContent {
    if (!node.content?.length) return node;
    node.content = node.content
      .map(prune)
      .filter((ch) => !(ch.type === "text" && (ch.text ?? "") === ""));
    return node;
  }
  return { doc: prune(doc), replaced: true };
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
