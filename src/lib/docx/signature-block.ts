import PizZip from "pizzip";
import type { JSONContent } from "@tiptap/core";
import { parseHtmlInlineContent } from "@/lib/import/html-table-parser";

const CLOSE_TBL = "</w:tbl>";
const CLOSE_TR = "</w:tr>";
const CLOSE_TC = "</w:tc>";

const W_NS_OPEN = {
  tbl: "<w:tbl",
  tr: "<w:tr",
  tc: "<w:tc",
} as const;

type WordOpenTag = keyof typeof W_NS_OPEN;

export type SignatureBlockSnapshot = {
  /** Two-row TipTap table for in-app display. */
  table: JSONContent;
  /** Original OOXML rows for export (preserves column count and merges). */
  headerRowXml: string;
  dataRowXml: string;
};

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

function extractTcPlainText(tcXml: string): string {
  return Array.from(tcXml.matchAll(/<w:t[^>]*>([^<]*)<\/\w:t>/g))
    .map((m) => m[1] ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGridSpan(tcXml: string): number {
  const m = /<w:gridSpan\s+w:val="(\d+)"/i.exec(tcXml);
  return m ? Math.max(1, parseInt(m[1]!, 10)) : 1;
}

function isSignatureHeaderRowText(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    /\bprepared\b/.test(t) &&
    /\bsign\s*\/\s*date\b/.test(t) &&
    (/\breviewed\b/.test(t) || /\bapproved\b/.test(t))
  );
}

/** Locate the QC/QA sign-off header row and the signature row directly beneath it. */
export function findSignatureRowPair(rowTexts: string[]): {
  headerIndex: number;
  dataIndex: number;
} | null {
  for (let i = rowTexts.length - 2; i >= 0; i--) {
    if (!isSignatureHeaderRowText(rowTexts[i] ?? "")) continue;
    return { headerIndex: i, dataIndex: i + 1 };
  }
  return null;
}

function wordRowToTipTapRow(trXml: string, asHeader: boolean): JSONContent {
  const cellType = asHeader ? "tableHeader" : "tableCell";
  const cells: JSONContent[] = [];
  for (const tcXml of splitTopLevelCells(trXml)) {
    const text = extractTcPlainText(tcXml);
    const colspan = extractGridSpan(tcXml);
    const inline = text ? parseHtmlInlineContent(text) : [];
    const cell: JSONContent = {
      type: cellType,
      content: [
        {
          type: "paragraph",
          content: inline.length > 0 ? inline : [],
        },
      ],
    };
    if (colspan > 1) {
      cell.attrs = { colspan };
    }
    cells.push(cell);
  }
  return { type: "tableRow", content: cells };
}

function buildTipTapTable(headerRowXml: string, dataRowXml: string): JSONContent {
  return {
    type: "table",
    content: [
      wordRowToTipTapRow(headerRowXml, true),
      wordRowToTipTapRow(dataRowXml, false),
    ],
  };
}

function readDocumentXml(buffer: Buffer): string | null {
  try {
    const zip = new PizZip(buffer);
    return zip.file("word/document.xml")?.asText() ?? null;
  } catch {
    return null;
  }
}

/** Extract the bottom reviewer sign-off block (often its own small table after the main grid). */
export function extractSignatureBlockFromDocxBuffer(
  buffer: Buffer
): SignatureBlockSnapshot | null {
  const xml = readDocumentXml(buffer);
  if (!xml) return null;

  const tables: Array<{ rows: string[]; rowTexts: string[] }> = [];

  let pos = 0;
  while (pos < xml.length) {
    const start = findNextWordOpenTag(xml, pos, "tbl");
    if (start < 0) break;
    const end = findBalancedWordTagEnd(xml, start, "tbl", CLOSE_TBL);
    if (end < 0) break;
    const tblXml = xml.slice(start, end + CLOSE_TBL.length);
    const innerStart = tblXml.indexOf(">") + 1;
    const inner = tblXml.slice(innerStart, tblXml.length - CLOSE_TBL.length);
    const rows = splitTopLevelRows(inner);
    const rowTexts = rows.map((tr) => extractTcPlainText(tr));
    tables.push({ rows, rowTexts });
    pos = start + 1;
  }

  for (let t = tables.length - 1; t >= 0; t--) {
    const table = tables[t]!;
    const pair = findSignatureRowPair(table.rowTexts);
    if (!pair) continue;
    const headerRowXml = table.rows[pair.headerIndex]!;
    const dataRowXml = table.rows[pair.dataIndex]!;
    return {
      headerRowXml,
      dataRowXml,
      table: buildTipTapTable(headerRowXml, dataRowXml),
    };
  }

  return null;
}

function replaceRowsInTableInner(
  tblInner: string,
  headerIndex: number,
  headerRowXml: string,
  dataRowXml: string
): string {
  const rows = splitTopLevelRows(tblInner);
  if (headerIndex < 0 || headerIndex + 1 >= rows.length) return tblInner;

  const rebuilt = rows.map((row, idx) => {
    if (idx === headerIndex) return headerRowXml;
    if (idx === headerIndex + 1) return dataRowXml;
    return row;
  });

  let pos = 0;
  let rowIdx = 0;
  let out = "";
  while (pos < tblInner.length && rowIdx < rows.length) {
    const start = findNextWordOpenTag(tblInner, pos, "tr");
    if (start < 0) {
      out += tblInner.slice(pos);
      break;
    }
    out += tblInner.slice(pos, start);
    const end = findBalancedWordTagEnd(tblInner, start, "tr", CLOSE_TR);
    if (end < 0) {
      out += tblInner.slice(start);
      break;
    }
    out += rebuilt[rowIdx]!;
    pos = end + CLOSE_TR.length;
    rowIdx++;
  }
  return out;
}

/** Swap the template sign-off rows with the uploaded snapshot (keeps original column layout). */
export function applySignatureBlockToDocumentXml(
  xml: string,
  block: SignatureBlockSnapshot
): string {
  let targetStart = -1;
  let targetEnd = -1;
  let targetInner = "";
  let targetPair: { headerIndex: number; dataIndex: number } | null = null;

  const candidates: Array<{
    start: number;
    end: number;
    inner: string;
    pair: { headerIndex: number; dataIndex: number };
  }> = [];

  let pos = 0;
  while (pos < xml.length) {
    const start = findNextWordOpenTag(xml, pos, "tbl");
    if (start < 0) break;
    const end = findBalancedWordTagEnd(xml, start, "tbl", CLOSE_TBL);
    if (end < 0) break;
    const tblXml = xml.slice(start, end + CLOSE_TBL.length);
    const innerStart = tblXml.indexOf(">") + 1;
    const inner = tblXml.slice(innerStart, tblXml.length - CLOSE_TBL.length);
    const rows = splitTopLevelRows(inner);
    const rowTexts = rows.map((tr) => extractTcPlainText(tr));
    const pair = findSignatureRowPair(rowTexts);
    if (pair) {
      candidates.push({ start, end: end + CLOSE_TBL.length, inner, pair });
    }
    pos = start + 1;
  }

  const chosen = candidates[candidates.length - 1];
  if (!chosen) return xml;

  targetStart = chosen.start;
  targetEnd = chosen.end;
  targetInner = chosen.inner;
  targetPair = chosen.pair;

  if (targetStart < 0 || !targetPair) return xml;

  const newInner = replaceRowsInTableInner(
    targetInner,
    targetPair.headerIndex,
    block.headerRowXml,
    block.dataRowXml
  );
  const openTagEnd = xml.indexOf(">", targetStart) + 1;
  return (
    xml.slice(0, openTagEnd) +
    newInner +
    xml.slice(targetEnd - CLOSE_TBL.length)
  );
}

export function applySignatureBlockToDocxZip(
  zip: PizZip,
  block: SignatureBlockSnapshot | null | undefined
): void {
  if (!block) return;
  const file = zip.file("word/document.xml");
  if (!file) return;
  const xml = file.asText();
  const next = applySignatureBlockToDocumentXml(xml, block);
  zip.file("word/document.xml", next);
}
