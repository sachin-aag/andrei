import type { JSONContent } from "@tiptap/core";

/**
 * Extract data tables from mammoth HTML output and convert each to
 * Tiptap-compatible JSONContent (table → tableRow → tableCell/tableHeader → paragraph).
 *
 * Handles nested tables correctly: many DOCX files use a wrapper table for
 * layout (containing section headings like "Define:", "Measure:", etc. in rows).
 * Only *inner* data tables (depth ≥ 1) are extracted. Top-level tables that
 * look like layout wrappers (contain section heading keywords or are single-row
 * signature blocks) are skipped.
 */
export function parseHtmlTables(html: string): JSONContent[] {
  return parseHtmlTablesWithPositions(html).map((t) => t.node);
}

type TableWithPosition = {
  node: JSONContent;
  /** Position of the <table> open tag in the source HTML. */
  openPos: number;
  /**
   * Index among all `<table>` elements in the HTML (document order).
   * Used to match `<w:tbl>` order in `word/document.xml`.
   */
  docTableIndex: number;
};

export function parseHtmlTablesWithPositions(
  html: string
): TableWithPosition[] {
  const allRanges = findAllTableRanges(html);
  const docOrderRank = new Map(
    [...allRanges]
      .sort((a, b) => a.openPos - b.openPos)
      .map((range, idx) => [range, idx] as const)
  );

  /** Mammoth / HTML order (outer table before nested inner tables by `<table` open offset). */
  const inDocOrder = [...allRanges].sort((a, b) => a.openPos - b.openPos);
  const tables: TableWithPosition[] = [];

  for (const range of inDocOrder) {
    if (!isDataTableRange(html, range)) continue;

    const tableHtml = html.slice(range.contentStart, range.contentEnd);
    const cleanedHtml = stripNestedTables(tableHtml);
    const rows = parseTableRows(cleanedHtml);
    if (rows.length > 0) {
      const normalizedRows = normalizeTableGrid(rows);
      tables.push({
        node: { type: "table", content: normalizedRows },
        openPos: range.openPos,
        docTableIndex: docOrderRank.get(range)!,
      });
    }
  }

  return tables;
}

/**
 * Return the HTML positions of data tables (those returned by `parseHtmlTables`).
 * Used by the import pipeline to map tables to document sections.
 */
export function findDataTablePositions(html: string): number[] {
  return parseHtmlTablesWithPositions(html).map((t) => t.openPos);
}

type TableRange = {
  /** Position of the <table> open tag in the HTML. */
  openPos: number;
  /** Start of inner content (after the <table...> tag). */
  contentStart: number;
  /** End of inner content (position of the </table> close tag). */
  contentEnd: number;
  /** Nesting depth (0 = top-level). */
  depth: number;
};

/**
 * Stack-based scanner: every `<table>` / `</table>` pair in document order.
 */
function findAllTableRanges(html: string): TableRange[] {
  const openRegex = /<table\b[^>]*>/gi;
  const closeRegex = /<\/table>/gi;

  type Event = { type: "open" | "close"; pos: number; endPos: number };
  const events: Event[] = [];

  let m: RegExpExecArray | null;
  while ((m = openRegex.exec(html)) !== null) {
    events.push({ type: "open", pos: m.index, endPos: m.index + m[0].length });
  }
  while ((m = closeRegex.exec(html)) !== null) {
    events.push({ type: "close", pos: m.index, endPos: m.index + m[0].length });
  }
  events.sort((a, b) => a.pos - b.pos);

  const allRanges: TableRange[] = [];
  const stack: { pos: number; contentStart: number; depth: number }[] = [];
  let depth = 0;

  for (const event of events) {
    if (event.type === "open") {
      stack.push({ pos: event.pos, contentStart: event.endPos, depth });
      depth++;
    } else {
      depth--;
      const opener = stack.pop();
      if (opener) {
        allRanges.push({
          openPos: opener.pos,
          contentStart: opener.contentStart,
          contentEnd: event.pos,
          depth: opener.depth,
        });
      }
    }
  }

  return allRanges;
}

function isDataTableRange(html: string, range: TableRange): boolean {
  if (range.depth >= 1) return true;
  if (isLayoutWrapper(html, range)) return false;
  if (isSignatureTable(html, range)) return false;
  return true;
}

const SECTION_HEADING_RE =
  /\b(?:Define|Measure|Analyze|Improve|Control)\s*(?::|<\/strong>)/i;

function isLayoutWrapper(html: string, range: TableRange): boolean {
  const content = html.slice(range.contentStart, range.contentEnd);
  return SECTION_HEADING_RE.test(content);
}

function isSignatureTable(html: string, range: TableRange): boolean {
  const content = html.slice(range.contentStart, range.contentEnd);
  // Signature tables typically contain "Prepared By", "Approved By", "Sign/Date"
  return (
    /\bPrepared\s+By\b/i.test(content) ||
    /\bApproved\s+By\b/i.test(content) ||
    /\bSign\/Date\b/i.test(content)
  );
}

/**
 * Remove nested `<table>...</table>` blocks from HTML so that when we parse
 * rows of a parent table, we don't accidentally include rows from child tables.
 */
function stripNestedTables(html: string): string {
  let result = "";
  let depth = 0;
  let pos = 0;

  const tagRegex = /<\/?table\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const isClose = match[0].startsWith("</");
    if (!isClose) {
      if (depth === 0) {
        // Keep content before this nested table
        result += html.slice(pos, match.index);
      }
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        pos = match.index + match[0].length;
      }
    }
  }

  // Append remaining content after last nested table
  if (depth === 0) {
    result += html.slice(pos);
  }

  return result;
}

/**
 * Ensure each row accounts for the full logical column count. When a cell has
 * rowspan > 1, mammoth only emits it in the first row — subsequent rows have
 * fewer <td> elements. ProseMirror handles this natively via rowspan attrs, so
 * we don't insert placeholder cells. Instead we verify the grid is consistent
 * and compute the logical column count so downstream code can trust it.
 *
 * For rows that are short (fewer cells than the logical column count and not
 * covered by rowspans), we pad with empty cells so ProseMirror doesn't choke.
 */
function normalizeTableGrid(rows: JSONContent[]): JSONContent[] {
  if (rows.length === 0) return rows;

  // Determine the logical column count from the first row
  const firstRowCells = rows[0]!.content ?? [];
  let colCount = 0;
  for (const cell of firstRowCells) {
    colCount += cell.attrs?.colspan ?? 1;
  }
  if (colCount === 0) return rows;

  // Build an occupancy grid: occupied[row][col] = true if covered by a
  // spanning cell from a previous row.
  const numRows = rows.length;
  const occupied: boolean[][] = Array.from({ length: numRows }, () =>
    Array(colCount).fill(false) as boolean[]
  );

  for (let r = 0; r < numRows; r++) {
    const cells = rows[r]!.content ?? [];
    let col = 0;
    for (const cell of cells) {
      // Skip past columns occupied by rowspans from above
      while (col < colCount && occupied[r]![col]) col++;

      const cs = cell.attrs?.colspan ?? 1;
      const rs = cell.attrs?.rowspan ?? 1;

      // Mark occupied positions for rowspan > 1
      if (rs > 1) {
        for (let dr = 1; dr < rs && r + dr < numRows; dr++) {
          for (let dc = 0; dc < cs && col + dc < colCount; dc++) {
            occupied[r + dr]![col + dc] = true;
          }
        }
      }

      col += cs;
    }

    // If this row is still short after accounting for occupied cells, pad
    const occupiedInRow = occupied[r]!.filter(Boolean).length;
    let cellColCount = 0;
    for (const cell of cells) {
      cellColCount += cell.attrs?.colspan ?? 1;
    }
    const totalCovered = cellColCount + occupiedInRow;

    if (totalCovered < colCount) {
      const missing = colCount - totalCovered;
      const isHeaderRow = cells.length > 0 && cells[0]!.type === "tableHeader";
      const cellType = isHeaderRow ? "tableHeader" : "tableCell";
      const newCells = [...cells];
      for (let i = 0; i < missing; i++) {
        newCells.push({
          type: cellType,
          content: [{ type: "paragraph" }],
        });
      }
      rows[r] = { ...rows[r]!, content: newCells };
    }
  }

  return rows;
}

function parseTableRows(tableHtml: string): JSONContent[] {
  const rows: JSONContent[] = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  let rowIndex = 0;

  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1]!;
    const cells = parseTableCells(rowHtml, rowIndex === 0);
    if (cells.length > 0) {
      rows.push({ type: "tableRow", content: cells });
    }
    rowIndex++;
  }

  return rows;
}

function parseTableCells(
  rowHtml: string,
  isFirstRow: boolean
): JSONContent[] {
  const cells: JSONContent[] = [];
  const cellRegex = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let cellMatch: RegExpExecArray | null;

  while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
    const tagName = cellMatch[1]!.toLowerCase();
    const tagAttrs = cellMatch[2]!;
    const cellHtml = cellMatch[3]!;
    const isHeader = tagName === "th" || isFirstRow;
    const cellType = isHeader ? "tableHeader" : "tableCell";

    const colspan = extractSpanAttr(tagAttrs, "colspan");
    const rowspan = extractSpanAttr(tagAttrs, "rowspan");
    const align = extractTextAlign(tagAttrs, cellHtml);

    const paragraphs = parseCellParagraphs(cellHtml);

    const cell: JSONContent = { type: cellType, content: paragraphs };
    const attrs: Record<string, number | string> = {};
    if (colspan > 1) attrs.colspan = colspan;
    if (rowspan > 1) attrs.rowspan = rowspan;
    if (align) attrs.align = align;
    if (Object.keys(attrs).length > 0) {
      cell.attrs = attrs;
    }
    cells.push(cell);
  }

  return cells;
}

const CELL_H_ALIGN = new Set(["left", "center", "right"]);

/**
 * Derives Tiptap table cell `align` from `<td>/<th>` attributes and inner `<p>`
 * styles (e.g. mammoth emits text-align on paragraphs, not on cells).
 */
export function extractTextAlign(
  tagAttrs: string,
  cellHtml: string
): "left" | "center" | "right" | null {
  const fromTag = parseHorizontalAlignFromAttrString(tagAttrs);
  const pOpenRe = /<p\b([^>]*)>/gi;
  const perParagraph: ("left" | "center" | "right" | null)[] = [];
  let m: RegExpExecArray | null;
  while ((m = pOpenRe.exec(cellHtml)) !== null) {
    perParagraph.push(parseHorizontalAlignFromAttrString(m[1]!));
  }

  if (perParagraph.length > 0) {
    const explicit = perParagraph.filter(
      (v): v is "left" | "center" | "right" => v != null
    );
    if (explicit.length === 0) return fromTag;
    if (explicit.length !== perParagraph.length) return null;
    const first = explicit[0]!;
    return explicit.every((v) => v === first) ? first : null;
  }

  return fromTag;
}

function parseHorizontalAlignFromAttrString(
  attrString: string
): "left" | "center" | "right" | null {
  const fromStyle = matchTextAlignInStyleBlob(attrString);
  if (fromStyle && CELL_H_ALIGN.has(fromStyle)) return fromStyle;

  const alignM = /\balign\s*=\s*["']?([^"'>\s]+)/i.exec(attrString);
  if (alignM) {
    const v = alignM[1]!.trim().toLowerCase();
    if (v === "middle") return "center";
    if (v === "left" || v === "center" || v === "right") return v;
  }
  return null;
}

function matchTextAlignInStyleBlob(
  blob: string
): "left" | "center" | "right" | null {
  const ta = /text-align\s*:\s*([^;]+)/i.exec(blob);
  if (!ta) return null;
  let raw = ta[1]!.trim().replace(/^["']|["']$/g, "").trim();
  raw = raw.split(/\s+/)[0]!.toLowerCase();
  if (raw === "start") return "left";
  if (raw === "end") return "right";
  if (raw === "left" || raw === "center" || raw === "right") return raw;
  return null;
}

function extractSpanAttr(attrs: string, name: string): number {
  const re = new RegExp(`${name}\\s*=\\s*["']?(\\d+)["']?`, "i");
  const m = re.exec(attrs);
  return m ? parseInt(m[1]!, 10) : 1;
}

function parseCellParagraphs(cellHtml: string): JSONContent[] {
  const paragraphs: JSONContent[] = [];
  const paraRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = paraRegex.exec(cellHtml)) !== null) {
    paragraphs.push(parseHtmlInlineParagraph(match[1]!));
  }

  if (paragraphs.length > 0) return paragraphs;

  const trimmed = cellHtml.trim();
  return trimmed ? [parseHtmlInlineParagraph(trimmed)] : [{ type: "paragraph" }];
}

type InlineMarkState = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

const BOLD_INLINE_TAGS = new Set(["strong", "b"]);
const ITALIC_INLINE_TAGS = new Set(["em", "i"]);
const UNDERLINE_INLINE_TAGS = new Set(["u"]);
/** Tags whose contents are ignored (mammoth form controls, etc.). */
const SKIP_INLINE_TAGS = new Set(["input", "img", "script", "style", "meta"]);

function parseHtmlInlineParagraph(innerHtml: string): JSONContent {
  const parts = innerHtml.split(/<br\s*\/?>/gi);
  const inline: JSONContent[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i > 0) inline.push({ type: "hardBreak" });
    inline.push(...parseHtmlInlineContent(parts[i]!));
  }

  return { type: "paragraph", content: inline.length > 0 ? inline : [] };
}

function marksFromState(state: InlineMarkState): JSONContent["marks"] | undefined {
  const marks: NonNullable<JSONContent["marks"]> = [];
  if (state.bold) marks.push({ type: "bold" });
  if (state.italic) marks.push({ type: "italic" });
  if (state.underline) marks.push({ type: "underline" });
  return marks.length > 0 ? marks : undefined;
}

function applySpanStyleToMarkState(state: InlineMarkState, tagHtml: string): void {
  const styleM = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(tagHtml);
  if (!styleM) return;
  const style = styleM[1]!;
  const fw = /font-weight\s*:\s*([^;]+)/i.exec(style);
  if (fw) {
    const w = fw[1]!.trim().toLowerCase();
    if (w === "bold" || w === "bolder" || (Number.parseInt(w, 10) || 0) >= 600) {
      state.bold = true;
    }
  }
  const fs = /font-style\s*:\s*([^;]+)/i.exec(style);
  if (fs && fs[1]!.trim().toLowerCase() === "italic") state.italic = true;
  const td = /text-decoration(?:-line)?\s*:\s*([^;]+)/i.exec(style);
  if (td && td[1]!.toLowerCase().includes("underline")) state.underline = true;
}

function cloneMarkState(state: InlineMarkState): InlineMarkState {
  return {
    bold: state.bold,
    italic: state.italic,
    underline: state.underline,
  };
}

/**
 * Walk mammoth cell HTML and preserve inline formatting (bold/italic/underline).
 */
export function parseHtmlInlineContent(
  html: string,
  baseState: InlineMarkState = {}
): JSONContent[] {
  const nodes: JSONContent[] = [];
  const stack: InlineMarkState[] = [cloneMarkState(baseState)];
  const tokenRe = /(<\/?[a-z][a-z0-9]*\b[^>]*\/?>)|([^<]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(html)) !== null) {
    const tag = match[1];
    if (tag) {
      const isClose = /^<\//.test(tag);
      const nameM = /^<\/?\s*([a-z][a-z0-9]*)/i.exec(tag);
      const name = nameM?.[1]?.toLowerCase();
      if (!name) continue;

      if (/^<br\b/i.test(tag)) {
        nodes.push({ type: "hardBreak" });
        continue;
      }

      if (SKIP_INLINE_TAGS.has(name)) continue;

      if (isClose) {
        if (stack.length > 1) stack.pop();
        continue;
      }

      if (/\/>$/.test(tag)) continue;

      const next = cloneMarkState(stack[stack.length - 1]!);
      if (BOLD_INLINE_TAGS.has(name)) next.bold = true;
      else if (ITALIC_INLINE_TAGS.has(name)) next.italic = true;
      else if (UNDERLINE_INLINE_TAGS.has(name)) next.underline = true;
      else if (name === "span") applySpanStyleToMarkState(next, tag);
      stack.push(next);
      continue;
    }

    const rawText = decodeHtmlEntities(match[2] ?? "");
    if (!rawText) continue;

    const normalized = rawText.replace(/\s+/g, " ");
    const state = stack[stack.length - 1]!;
    const marks = marksFromState(state);
    const textNode: JSONContent = { type: "text", text: normalized };
    if (marks) textNode.marks = marks;

    const prev = nodes[nodes.length - 1];
    if (
      prev?.type === "text" &&
      textNode.type === "text" &&
      JSON.stringify(prev.marks ?? []) === JSON.stringify(textNode.marks ?? [])
    ) {
      prev.text = (prev.text ?? "") + normalized;
    } else {
      nodes.push(textNode);
    }
  }

  const filtered = nodes.filter((node) => {
    if (node.type !== "text") return true;
    return (node.text ?? "").length > 0;
  });

  if (filtered.length > 0) {
    const first = filtered[0]!;
    if (first.type === "text" && first.text) {
      first.text = first.text.replace(/^\s+/, "");
    }
    const last = filtered[filtered.length - 1]!;
    if (last.type === "text" && last.text) {
      last.text = last.text.replace(/\s+$/, "");
    }
  }

  return filtered.filter((node) => node.type !== "text" || (node.text ?? "").length > 0);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  );
}
