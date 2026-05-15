import PizZip from "pizzip";
import type { JSONContent } from "@tiptap/core";

/** TipTap cell attrs */
export type TableCellAlignment = {
  hAlign: "left" | "center" | "right" | null;
  vAlign: "top" | "middle" | "bottom" | null;
};

export type DocxTableAlignmentSpec = {
  /** One Word row per entry; each row lists `<w:tc>` left-to-right (including vMerge continue). */
  rawRows: RawCell[][];
  /**
   * Plain text from the first `<w:p>` in each cell (same shape as `rawRows`), used to match
   * a mammoth HTML sub-table to a row range inside a large Word layout table.
   */
  rowTexts: string[][];
};

type RawCell = {
  hAlign: TableCellAlignment["hAlign"];
  vAlign: TableCellAlignment["vAlign"];
  vMerge: "restart" | "continue" | null;
};

const CLOSE_TBL = "</w:tbl>";
const CLOSE_TR = "</w:tr>";
const CLOSE_TC = "</w:tc>";

const W_NS_OPEN = {
  tbl: "<w:tbl",
  tr: "<w:tr",
  tc: "<w:tc",
  p: "<w:p",
} as const;

type WordOpenTag = keyof typeof W_NS_OPEN;

/** `<w:tc` must not match `<w:tcPr>`, etc. */
function findNextWordOpenTag(s: string, from: number, tag: WordOpenTag): number {
  const needle = W_NS_OPEN[tag];
  let i = from;
  while (i < s.length) {
    const idx = s.indexOf(needle, i);
    if (idx < 0) return -1;
    const next = s[idx + needle.length]!;
    if (next === undefined || /[\s>/]/.test(next)) return idx;
    i = idx + needle.length;
  }
  return -1;
}

function findBalancedWordTagEnd(
  s: string,
  start: number,
  tag: WordOpenTag,
  close: string
): number {
  const open = W_NS_OPEN[tag];
  let depth = 1;
  let i = start + open.length;
  while (i < s.length && depth > 0) {
    const nextOpen = findNextWordOpenTag(s, i, tag);
    const nextClose = s.indexOf(close, i);
    if (nextClose < 0) return -1;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + open.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      i = nextClose + close.length;
    }
  }
  return -1;
}

/** Read `word/document.xml` and return one spec per `<w:tbl>` (including nested). */
export function extractTableAlignmentSpecsFromDocxBuffer(
  buffer: Buffer
): DocxTableAlignmentSpec[] {
  try {
    const zip = new PizZip(buffer);
    const raw = zip.file("word/document.xml")?.asText();
    if (!raw) return [];
    return extractTableAlignmentSpecsFromDocumentXml(raw);
  } catch {
    return [];
  }
}

/**
 * Extract alignment from every `<w:tbl>` by scanning `<w:tbl` in file order; after each
 * table, search resumes at `start + 1` so nested tables become separate specs.
 */
export function extractTableAlignmentSpecsFromDocumentXml(
  xml: string
): DocxTableAlignmentSpec[] {
  const out: DocxTableAlignmentSpec[] = [];
  let pos = 0;
  while (pos < xml.length) {
    const start = findNextWordOpenTag(xml, pos, "tbl");
    if (start < 0) break;
    const end = findBalancedWordTagEnd(xml, start, "tbl", CLOSE_TBL);
    if (end < 0) break;
    const tblXml = xml.slice(start, end + CLOSE_TBL.length);
    const innerStart = tblXml.indexOf(">") + 1;
    const inner = tblXml.slice(innerStart, tblXml.length - CLOSE_TBL.length);
    const parsed = parseRawRowsFromTableInner(inner);
    out.push({ rawRows: parsed.rawRows, rowTexts: parsed.rowTexts });
    pos = start + 1;
  }
  return out;
}

function splitTopLevelRows(tblInner: string): string[] {
  const rows: string[] = [];
  let pos = 0;
  while (pos < tblInner.length) {
    const start = findNextWordOpenTag(tblInner, pos, "tr");
    if (start < 0) break;
    const end = findBalancedWordTagEnd(tblInner, start, "tr", CLOSE_TR);
    if (end < 0) break;
    rows.push(tblInner.slice(start, end + CLOSE_TR.length));
    pos = end + CLOSE_TR.length;
  }
  return rows;
}

function splitTopLevelCells(trXml: string): string[] {
  const innerStart = trXml.indexOf(">") + 1;
  const inner = trXml.slice(innerStart, trXml.length - CLOSE_TR.length);
  const cells: string[] = [];
  let pos = 0;
  while (pos < inner.length) {
    const start = findNextWordOpenTag(inner, pos, "tc");
    if (start < 0) break;
    const end = findBalancedWordTagEnd(inner, start, "tc", CLOSE_TC);
    if (end < 0) break;
    cells.push(inner.slice(start, end + CLOSE_TC.length));
    pos = end + CLOSE_TC.length;
  }
  return cells;
}

function parseRawRowsFromTableInner(tblInner: string): {
  rawRows: RawCell[][];
  rowTexts: string[][];
} {
  const rawRows: RawCell[][] = [];
  const rowTexts: string[][] = [];
  for (const tr of splitTopLevelRows(tblInner)) {
    const cells = splitTopLevelCells(tr);
    rawRows.push(cells.map(parseRawCell));
    rowTexts.push(cells.map(extractTcPlainText));
  }
  return { rawRows, rowTexts };
}

/** First paragraph’s visible text in a `<w:tc>` (for header fingerprinting). */
function extractTcPlainText(tcXml: string): string {
  const innerStart = tcXml.indexOf(">") + 1;
  const inner = tcXml.slice(innerStart, tcXml.length - CLOSE_TC.length);
  const pStart = findNextWordOpenTag(inner, 0, "p");
  if (pStart < 0) return "";
  const pEnd = findBalancedWordTagEnd(inner, pStart, "p", "</w:p>");
  if (pEnd < 0) return "";
  const pXml = inner.slice(pStart, pEnd + "</w:p>".length);
  return [...pXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)]
    .map((m) => stripXmlNoise(m[1] ?? ""))
    .join("")
    .trim();
}

function stripXmlNoise(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function parseRawCell(tcXml: string): RawCell {
  return {
    hAlign: readCellHorizontalAlign(tcXml),
    vAlign: readTcVertAlign(tcXml),
    vMerge: readVMerge(tcXml),
  };
}

function readVMerge(tcXml: string): RawCell["vMerge"] {
  const block = /w:tcPr\b[^>]*>[\s\S]*?<\/w:tcPr>/i.exec(tcXml)?.[0] ?? "";
  if (!/w:vMerge\b/i.test(block)) return null;
  const m = /w:vMerge\b[^>]*(?:w:)?val="([^"]+)"/i.exec(block);
  if (m && m[1]!.toLowerCase() === "restart") return "restart";
  return "continue";
}

function readTcVertAlign(tcXml: string): TableCellAlignment["vAlign"] {
  const block = /w:tcPr\b[^>]*>[\s\S]*?<\/w:tcPr>/i.exec(tcXml)?.[0] ?? "";
  const m = /w:vAlign\b[^>]*(?:w:)?val="([^"]+)"/i.exec(block);
  if (!m) return null;
  const v = m[1]!.toLowerCase();
  if (v === "top") return "top";
  if (v === "bottom") return "bottom";
  if (v === "center" || v === "middle") return "middle";
  return null;
}

/**
 * Horizontal alignment from paragraph properties inside the cell. Walks every `<w:p>`
 * so we still pick up `w:jc` when Word stores it on a non-first paragraph.
 */
function readCellHorizontalAlign(tcXml: string): TableCellAlignment["hAlign"] {
  const innerStart = tcXml.indexOf(">") + 1;
  const inner = tcXml.slice(innerStart, tcXml.length - CLOSE_TC.length);
  let pos = 0;
  while (pos < inner.length) {
    const pStart = findNextWordOpenTag(inner, pos, "p");
    if (pStart < 0) break;
    const pEnd = findBalancedWordTagEnd(inner, pStart, "p", "</w:p>");
    if (pEnd < 0) break;
    const pXml = inner.slice(pStart, pEnd + "</w:p>".length);
    const pPr = /w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/i.exec(pXml)?.[0] ?? "";
    const jc = /w:jc\b[^>]*(?:w:)?val="([^"]+)"/i.exec(pPr)?.[1]?.toLowerCase();
    const mapped = mapWordJc(jc ?? null);
    if (mapped) return mapped;
    pos = pEnd + "</w:p>".length;
  }
  return null;
}

/**
 * Word `w:jc` — in table cells, `both` (justify) is often used for numeric grids and
 * reads visually like centered text; we map it to `center` so imports match the doc.
 */
function mapWordJc(jc: string | null): TableCellAlignment["hAlign"] {
  if (!jc) return null;
  if (jc === "center") return "center";
  if (jc === "left" || jc === "start") return "left";
  if (jc === "right" || jc === "end") return "right";
  if (jc === "both") return "center";
  if (jc === "distribute" || jc === "thaidistribute") return "center";
  return null;
}

function applyAlignmentToJsonCell(cell: JSONContent, align: TableCellAlignment): void {
  if (!align.hAlign && !align.vAlign) return;
  const attrs: Record<string, number | string> = { ...(cell.attrs ?? {}) };
  if (align.hAlign) attrs.align = align.hAlign;
  if (align.vAlign) attrs.verticalAlign = align.vAlign;
  cell.attrs = attrs;
}

function normalizeFingerprintText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function tipTapFirstRowTexts(table: JSONContent): string[] {
  const row0 = table.content?.[0];
  if (!row0?.content) return [];
  return row0.content.map((cell) => {
    const parts: string[] = [];
    for (const p of cell.content ?? []) {
      if (p.type === "paragraph") {
        parts.push(paragraphPlainText(p));
      }
    }
    return normalizeFingerprintText(parts.join(" "));
  });
}

function paragraphPlainText(p: JSONContent): string {
  if (p.type === "text") return (p.text ?? "").trim();
  if (!p.content?.length) return "";
  return p.content.map(paragraphPlainText).join("");
}

function findSliceMergeStartRow(table: JSONContent, spec: DocxTableAlignmentSpec): number {
  const headers = tipTapFirstRowTexts(table);
  if (headers.length === 0) return -1;
  const tipLen = table.content?.length ?? 0;
  const { rawRows, rowTexts } = spec;
  if (tipLen === 0 || tipLen > rawRows.length) return -1;

  for (let s = 0; s <= rawRows.length - tipLen; s++) {
    const rowT = rowTexts[s];
    if (!rowT || rowT.length !== headers.length) continue;
    const ok = rowT.every(
      (t, i) => normalizeFingerprintText(t) === headers[i]
    );
    if (ok) return s;
  }
  return -1;
}

/**
 * Walk one TipTap row per Word row, skipping `w:vMerge` continuation cells on the Word side.
 * Returns false if the grid does not line up (short row in Word XML vs TipTap cells).
 */
function walkMergeAlignmentIntoTable(
  table: JSONContent,
  rawRows: RawCell[][]
): boolean {
  const tipRows = table.content ?? [];
  if (tipRows.length !== rawRows.length) return false;

  for (let r = 0; r < tipRows.length; r++) {
    const tipCells = tipRows[r]!.content ?? [];
    const wordRow = rawRows[r] ?? [];
    let wi = 0;
    for (const tipCell of tipCells) {
      while (wi < wordRow.length && wordRow[wi]!.vMerge === "continue") {
        wi++;
      }
      if (wi >= wordRow.length) return false;
      const wc = wordRow[wi]!;
      applyAlignmentToJsonCell(tipCell, { hAlign: wc.hAlign, vAlign: wc.vAlign });
      wi++;
    }
  }
  return true;
}

/**
 * Apply OOXML jc / vAlign to Tiptap table cells. Skips `w:vMerge` continuation cells
 * so row cell counts match mammoth output (rowspan source cells only).
 *
 * When mammoth emits a sub-table that lives inside a larger Word `<w:tbl>`, row counts
 * differ; we then find the first OOXML row whose cell texts match the TipTap header row
 * and merge that contiguous slice.
 *
 * @returns true if alignment was applied (full or slice match).
 */
export function mergeDocxAlignmentIntoTipTapTable(
  table: JSONContent,
  spec: DocxTableAlignmentSpec | undefined
): boolean {
  if (!spec) return false;
  const { rawRows } = spec;
  if (walkMergeAlignmentIntoTable(table, rawRows)) return true;

  const start = findSliceMergeStartRow(table, spec);
  if (start < 0) return false;
  const tipLen = table.content?.length ?? 0;
  const slice = rawRows.slice(start, start + tipLen);
  return walkMergeAlignmentIntoTable(table, slice);
}

/**
 * Try each `<w:tbl>` in document order until one matches the TipTap grid (full or slice).
 */
export function mergeDocxAlignmentIntoTipTapTableFromSpecs(
  table: JSONContent,
  specs: DocxTableAlignmentSpec[]
): void {
  for (const spec of specs) {
    if (mergeDocxAlignmentIntoTipTapTable(table, spec)) return;
  }
}
