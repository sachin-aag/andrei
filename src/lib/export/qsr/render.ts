import type { JSONContent } from "@tiptap/core";
import type PizZip from "pizzip";
import type { DocxExportContext } from "@/lib/export/docx-export-context";
import { narrativeToDocxXmlWithContext } from "@/lib/export/narrative-to-docx-xml";
import {
  isQsrSectionKey,
  type QsrMetadata,
  type QsrSectionKey,
} from "@/lib/document-types/qsr/sections";
import { citationNumbersFromDoc } from "@/lib/suggestions/citations-at-end";
import { normalizeRichField } from "@/lib/tiptap/rich-text";
import {
  appendToLastParagraph,
  bookmarkXml,
  buildCellProperties,
  cellGridSpan,
  childElements,
  elementText,
  escapeXmlText,
  findChild,
  isElement,
  mergeRunProperties,
  paragraphRunProperties,
  splitTopLevelElements,
  stripRowHeaderFlag,
  tableGridWidths,
  withChildren,
  type RunMarks,
} from "./ooxml";
import { fillQsrIndexPageNumbers } from "./index-pages";
import {
  QSR_BANNER_MARKER,
  QSR_HEADING_MARKER,
  QSR_ROW_MARKER,
  QSR_SLOTS,
  QSR_SPACER_MARKER,
  qsrSlotEnd,
  qsrSlotStart,
  type QsrSlot,
  type QsrTableMergeRules,
} from "./slots";

type ParagraphProto = { pPr: string; rPr: string };

const PLAIN_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "superscript",
  "subscript",
  "link",
  "code",
  "highlight",
]);

function paragraphProto(p: string | undefined): ParagraphProto {
  if (!p) return { pPr: "", rPr: "" };
  return { pPr: findChild(p, "w:pPr") ?? "", rPr: paragraphRunProperties(p) };
}

function withoutSectionBreaks(xml: string): string {
  return splitTopLevelElements(xml)
    .filter((el) => !el.includes("<w:sectPr"))
    .join("");
}

function fallbackXml(nodes: JSONContent[], ctx: DocxExportContext): string {
  const doc = normalizeRichField({ type: "doc", content: nodes });
  return withoutSectionBreaks(narrativeToDocxXmlWithContext(doc, ctx).xml);
}

function marksOf(node: JSONContent): RunMarks {
  const types = new Set((node.marks ?? []).map((m) => m.type));
  return {
    bold: types.has("bold"),
    italic: types.has("italic"),
    underline: types.has("underline"),
    strike: types.has("strike"),
    vertAlign: types.has("superscript")
      ? "superscript"
      : types.has("subscript")
        ? "subscript"
        : undefined,
  };
}

const CITATION_MARKER_RE = /\[(\d+)\]/g;

/** Split `[n]` into a superscript run when `n` is a citation in this field. */
function textRuns(
  text: string,
  rPr: string,
  marks: RunMarks,
  citationNumbers: ReadonlySet<number> | undefined
): string {
  if (!citationNumbers || citationNumbers.size === 0) {
    return `<w:r>${mergeRunProperties(rPr, marks)}<w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r>`;
  }
  const parts: string[] = [];
  const markerRe = new RegExp(CITATION_MARKER_RE.source, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(text)) !== null) {
    const n = Number(match[1]);
    if (!citationNumbers.has(n)) continue;
    if (match.index > last) {
      parts.push(
        `<w:r>${mergeRunProperties(rPr, marks)}<w:t xml:space="preserve">${escapeXmlText(text.slice(last, match.index))}</w:t></w:r>`
      );
    }
    parts.push(
      `<w:r>${mergeRunProperties(rPr, { ...marks, vertAlign: "superscript" })}<w:t xml:space="preserve">${escapeXmlText(String(n))}</w:t></w:r>`
    );
    last = match.index + match[0].length;
  }
  if (parts.length === 0) {
    return `<w:r>${mergeRunProperties(rPr, marks)}<w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r>`;
  }
  if (last < text.length) {
    parts.push(
      `<w:r>${mergeRunProperties(rPr, marks)}<w:t xml:space="preserve">${escapeXmlText(text.slice(last))}</w:t></w:r>`
    );
  }
  return parts.join("");
}

/** Runs for a paragraph, or null when it needs the generic renderer. */
function inlineRuns(
  nodes: JSONContent[],
  rPr: string,
  forceBold = false,
  citationNumbers?: ReadonlySet<number>
): string | null {
  let xml = "";
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      xml += `<w:r>${rPr}<w:br/></w:r>`;
      continue;
    }
    if (node.type !== "text" || typeof node.text !== "string") return null;
    if ((node.marks ?? []).some((m) => !PLAIN_MARKS.has(m.type))) return null;
    const marks = marksOf(node);
    if (forceBold) marks.bold = true;
    xml += textRuns(node.text, rPr, marks, citationNumbers);
  }
  return xml;
}

function paragraphXml(
  node: JSONContent,
  proto: ParagraphProto,
  ctx: DocxExportContext,
  forceBold = false,
  citationNumbers?: ReadonlySet<number>
): string {
  const runs = inlineRuns(
    node.content ?? [],
    proto.rPr,
    forceBold || node.type === "heading",
    citationNumbers
  );
  if (runs === null) return fallbackXml([node], ctx);
  return `<w:p>${proto.pPr}${runs}</w:p>`;
}

function blocksXml(
  nodes: JSONContent[],
  proto: ParagraphProto,
  ctx: DocxExportContext,
  forceBold = false,
  citationNumbers?: ReadonlySet<number>
): string {
  const parts = nodes.map((node) =>
    node.type === "paragraph" || node.type === "heading"
      ? paragraphXml(node, proto, ctx, forceBold, citationNumbers)
      : fallbackXml([node], ctx)
  );
  return parts.join("") || `<w:p>${proto.pPr}</w:p>`;
}

function nodeText(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(nodeText).join("");
}

function isBlank(node: JSONContent | undefined): boolean {
  if (!node) return true;
  const hasMedia = JSON.stringify(node).includes('"type":"image"');
  return !hasMedia && nodeText(node).trim() === "";
}

function isAllBold(node: JSONContent): boolean {
  const texts: JSONContent[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === "text" && n.text?.trim()) texts.push(n);
    n.content?.forEach(visit);
  };
  visit(node);
  return texts.length > 0 && texts.every((t) => t.marks?.some((m) => m.type === "bold"));
}

// ------------------------------------------------------------------ tables

type GridCell = {
  node: JSONContent;
  row: number;
  col: number;
  colspan: number;
  rowspan: number;
};

type Grid = {
  rows: Array<Array<GridCell | null>>;
  banners: Set<number>;
};

function spanOf(node: JSONContent, attr: "colspan" | "rowspan"): number {
  const value = Number((node.attrs as Record<string, unknown> | undefined)?.[attr] ?? 1);
  return Number.isFinite(value) && value > 1 ? Math.floor(value) : 1;
}

/** Owner cell for every grid position (same object across a span). */
function buildGrid(rows: JSONContent[], columns: number): Grid | null {
  const grid: Array<Array<GridCell | null>> = rows.map(() => Array(columns).fill(null));
  const banners = new Set<number>();
  for (let r = 0; r < rows.length; r += 1) {
    let c = 0;
    const cells = rows[r].content ?? [];
    if (cells.length === 1 && spanOf(cells[0], "colspan") === columns && columns > 1) {
      banners.add(r);
    }
    for (const cellNode of cells) {
      while (c < columns && grid[r][c]) c += 1;
      const colspan = spanOf(cellNode, "colspan");
      const rowspan = spanOf(cellNode, "rowspan");
      if (c + colspan > columns) return null;
      const cell: GridCell = { node: cellNode, row: r, col: c, colspan, rowspan };
      for (let dr = 0; dr < rowspan && r + dr < rows.length; dr += 1) {
        for (let dc = 0; dc < colspan; dc += 1) grid[r + dr][c + dc] = cell;
      }
      c += colspan;
    }
    if (grid[r].some((cell) => cell === null)) return null;
  }
  return { rows: grid, banners };
}

function isSimpleOrigin(grid: Grid, r: number, c: number): GridCell | null {
  const cell = grid.rows[r][c];
  if (!cell || cell.row !== r || cell.col !== c) return null;
  return cell.colspan === 1 && cell.rowspan === 1 ? cell : null;
}

function applyMergeRules(grid: Grid, rules: QsrTableMergeRules | undefined): void {
  if (!rules) return;
  const columns = grid.rows[0]?.length ?? 0;
  grid.rows.forEach((row, r) => {
    if (grid.banners.has(r) || !rules.boldFirstCellBanner) return;
    const first = isSimpleOrigin(grid, r, 0);
    if (!first || isBlank(first.node) || !isAllBold(first.node)) return;
    const restBlank = row.slice(1).every((cell) => cell && cell.rowspan === 1 && isBlank(cell.node));
    if (!restBlank) return;
    const banner: GridCell = { ...first, colspan: columns };
    grid.rows[r] = row.map(() => banner);
    grid.banners.add(r);
  });

  const k = rules.mergeBlankIntoNext;
  if (k !== undefined && k + 1 < columns) {
    grid.rows.forEach((_, r) => {
      if (grid.banners.has(r)) return;
      const left = isSimpleOrigin(grid, r, k);
      const right = isSimpleOrigin(grid, r, k + 1);
      if (!left || !right || !isBlank(left.node)) return;
      const merged: GridCell = { ...left, node: right.node, colspan: 2 };
      grid.rows[r][k] = merged;
      grid.rows[r][k + 1] = merged;
    });
  }

  const cont = rules.continueRow;
  if (cont) {
    for (let r = 1; r < grid.rows.length; r += 1) {
      if (grid.banners.has(r) || grid.banners.has(r - 1)) continue;
      const blank = grid.rows[r][cont.blankColumn];
      const filled = grid.rows[r][cont.filledColumn];
      if (!blank || !filled || !isBlank(blank.node) || isBlank(filled.node)) continue;
      for (const c of cont.columns) {
        const cell = isSimpleOrigin(grid, r, c);
        const above = grid.rows[r - 1][c];
        if (!cell || !isBlank(cell.node) || !above) continue;
        if (above.col !== c || above.colspan !== 1) continue;
        if (above.row + above.rowspan !== r) continue;
        above.rowspan += 1;
        grid.rows[r][c] = above;
      }
    }
  }
}

type TableProto = {
  prefix: string[];
  headerRows: string[];
  dataRow: string;
  bannerRow: string | null;
  widths: number[];
  /** Prototype data cell covering each grid column. */
  columnCells: string[];
};

function readTableProto(tbl: string): TableProto | null {
  const children = childElements(tbl);
  const rows = children.filter((c) => isElement(c, "w:tr"));
  const firstCellText = (tr: string) =>
    elementText(childElements(tr).find((c) => isElement(c, "w:tc")) ?? "").trim();
  const dataIndex = rows.findIndex((tr) => firstCellText(tr) === QSR_ROW_MARKER);
  if (dataIndex === -1) return null;
  const dataRow = rows[dataIndex];
  const widths = tableGridWidths(tbl);
  const columnCells: string[] = [];
  for (const tc of childElements(dataRow).filter((c) => isElement(c, "w:tc"))) {
    for (let i = 0; i < cellGridSpan(tc); i += 1) columnCells.push(tc);
  }
  if (!widths.length || columnCells.length !== widths.length) return null;
  return {
    prefix: children.filter((c) => !isElement(c, "w:tr")),
    headerRows: rows.slice(0, dataIndex),
    dataRow,
    bannerRow: rows.find((tr) => firstCellText(tr) === QSR_BANNER_MARKER) ?? null,
    widths,
    columnCells,
  };
}

function cellProto(tc: string): { tcPr: string; paragraph: ParagraphProto } {
  return {
    tcPr: findChild(tc, "w:tcPr") ?? "",
    paragraph: paragraphProto(childElements(tc).find((c) => isElement(c, "w:p"))),
  };
}

function trPrOf(tr: string): string {
  return stripRowHeaderFlag(findChild(tr, "w:trPr") ?? "");
}

function sumWidths(widths: number[], from: number, span: number): number {
  return widths.slice(from, from + span).reduce((a, b) => a + b, 0);
}

function bannerRowXml(
  cell: GridCell,
  proto: TableProto,
  ctx: DocxExportContext,
  citationNumbers?: ReadonlySet<number>
): string {
  const source = proto.bannerRow ?? proto.dataRow;
  const tc = childElements(source).find((c) => isElement(c, "w:tc")) ?? "";
  const { tcPr, paragraph } = cellProto(tc);
  const shape = { width: sumWidths(proto.widths, 0, proto.widths.length), gridSpan: proto.widths.length, vMerge: null };
  const content = blocksXml(
    cell.node.content ?? [],
    paragraph,
    ctx,
    proto.bannerRow === null,
    citationNumbers
  );
  return `<w:tr>${trPrOf(source)}<w:tc>${buildCellProperties(tcPr, shape)}${content}</w:tc></w:tr>`;
}

function bodyRowXml(
  grid: Grid,
  r: number,
  proto: TableProto,
  ctx: DocxExportContext,
  citationNumbers?: ReadonlySet<number>
): string {
  const cells: string[] = [];
  const row = grid.rows[r];
  for (let c = 0; c < row.length; ) {
    const cell = row[c]!;
    const { tcPr, paragraph } = cellProto(proto.columnCells[c]);
    const width = sumWidths(proto.widths, c, cell.colspan);
    if (cell.row === r) {
      const vMerge = cell.rowspan > 1 ? "restart" : null;
      cells.push(
        `<w:tc>${buildCellProperties(tcPr, { width, gridSpan: cell.colspan, vMerge })}${blocksXml(cell.node.content ?? [], paragraph, ctx, false, citationNumbers)}</w:tc>`
      );
    } else {
      cells.push(
        `<w:tc>${buildCellProperties(tcPr, { width, gridSpan: cell.colspan, vMerge: "continue" })}<w:p>${paragraph.pPr}</w:p></w:tc>`
      );
    }
    c += cell.colspan;
  }
  return `<w:tr>${trPrOf(proto.dataRow)}${cells.join("")}</w:tr>`;
}

function tableXml(
  table: JSONContent,
  protoTbl: string,
  rules: QsrTableMergeRules | undefined,
  ctx: DocxExportContext,
  citationNumbers?: ReadonlySet<number>
): string {
  const proto = readTableProto(protoTbl);
  const allRows = table.content ?? [];
  const firstBody = allRows.findIndex(
    (row) => !(row.content ?? []).every((cell) => cell.type === "tableHeader")
  );
  const bodyRows = firstBody === -1 ? [] : allRows.slice(firstBody);
  const grid = proto ? buildGrid(bodyRows, proto.widths.length) : null;
  if (!proto || !grid) return fallbackXml([table], ctx);
  applyMergeRules(grid, rules);
  const rows = grid.rows.map((row, r) =>
    grid.banners.has(r)
      ? bannerRowXml(row[0]!, proto, ctx, citationNumbers)
      : bodyRowXml(grid, r, proto, ctx, citationNumbers)
  );
  if (!rows.length) {
    const emptyGrid = buildGrid(
      [{ type: "tableRow", content: proto.widths.map(() => ({ type: "tableCell", content: [] })) }],
      proto.widths.length
    )!;
    rows.push(bodyRowXml(emptyGrid, 0, proto, ctx, citationNumbers));
  }
  return withChildren(protoTbl, [...proto.prefix, ...proto.headerRows, ...rows]);
}

// ------------------------------------------------------------------- slots

export type QsrSlotInput = {
  sections: Array<{ section: string; content: unknown }>;
  metadata: QsrMetadata;
  ctx: DocxExportContext;
};

function docField(content: unknown, field: "narrative" | "table"): JSONContent {
  const value =
    content && typeof content === "object"
      ? (content as Record<string, unknown>)[field]
      : undefined;
  return normalizeRichField(value);
}

function firstOfType(protos: string[], name: string): string | undefined {
  return protos.find((el) => isElement(el, name));
}

function narrativeSlotXml(doc: JSONContent, protos: string[], ctx: DocxExportContext): string {
  return blocksXml(
    doc.content ?? [],
    paragraphProto(firstOfType(protos, "w:p")),
    ctx,
    false,
    citationNumbersFromDoc(doc)
  );
}

function tableSlotXml(
  doc: JSONContent,
  protos: string[],
  rules: QsrTableMergeRules | undefined,
  ctx: DocxExportContext
): string {
  const protoTbl = firstOfType(protos, "w:tbl") ?? "";
  const citationNumbers = citationNumbersFromDoc(doc);
  const tables = (doc.content ?? []).filter((node) => node.type === "table");
  if (!tables.length) {
    return tableXml({ type: "table", content: [] }, protoTbl, rules, ctx, citationNumbers);
  }
  return (doc.content ?? [])
    .map((node) =>
      node.type === "table"
        ? tableXml(node, protoTbl, rules, ctx, citationNumbers)
        : fallbackXml([node], ctx)
    )
    .join("");
}

function volumetricSlotXml(
  doc: JSONContent,
  protos: string[],
  metadata: QsrMetadata,
  ctx: DocxExportContext
): string {
  const heading = paragraphProto(protos.find((el) => elementText(el) === QSR_HEADING_MARKER));
  const spacer = paragraphProto(protos.find((el) => elementText(el) === QSR_SPACER_MARKER));
  const protoTbl = firstOfType(protos, "w:tbl") ?? "";
  const citationNumbers = citationNumbersFromDoc(doc);
  const parts: string[] = [];
  (doc.content ?? []).forEach((node, index) => {
    if (node.type === "paragraph" || node.type === "heading") {
      if (isBlank(node)) {
        // The seeded first heading is the main equipment; its code lives in metadata.
        if (index === 0 && metadata.equipmentCode.trim()) {
          parts.push(
            paragraphXml(
              { type: "paragraph", content: [{ type: "text", text: metadata.equipmentCode.trim() }] },
              heading,
              ctx
            )
          );
        }
        return;
      }
      parts.push(paragraphXml(node, heading, ctx, false, citationNumbers));
      return;
    }
    if (node.type === "table") {
      parts.push(
        tableXml(node, protoTbl, undefined, ctx, citationNumbers),
        `<w:p>${spacer.pPr}</w:p>`
      );
      return;
    }
    parts.push(fallbackXml([node], ctx));
  });
  return parts.join("") || `<w:p>${spacer.pPr}</w:p>`;
}

function slotXml(
  slot: QsrSlot,
  content: unknown,
  protos: string[],
  input: QsrSlotInput
): string {
  switch (slot.kind) {
    case "narrative":
      return narrativeSlotXml(docField(content, "narrative"), protos, input.ctx);
    case "volumetric":
      return volumetricSlotXml(docField(content, "narrative"), protos, input.metadata, input.ctx);
    case "table":
      return tableSlotXml(docField(content, "table"), protos, slot.merge, input.ctx);
    default: {
      const exhaustive: never = slot;
      throw new Error(`Unknown QSR slot: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Replace every `[[QSR:key]]` slot in word/document.xml with the section
 * content, cloned from the prototype formatting inside the slot. Runs after
 * docxtemplater so user text is never parsed as template tags.
 */
export function applyQsrSlotsToDocxZip(zip: PizZip, input: QsrSlotInput): void {
  const file = zip.file("word/document.xml");
  if (!file) return;
  const xml = file.asText();
  const bodyStart = xml.indexOf("<w:body>") + "<w:body>".length;
  const bodyEnd = xml.lastIndexOf("</w:body>");
  const els = splitTopLevelElements(xml.slice(bodyStart, bodyEnd));
  const contentByKey = new Map<QsrSectionKey, unknown>();
  for (const row of input.sections) {
    if (isQsrSectionKey(row.section)) contentByKey.set(row.section, row.content);
  }

  const out: string[] = [];
  let bookmarkId = 9100;
  for (let i = 0; i < els.length; i += 1) {
    const text = isElement(els[i], "w:p") ? elementText(els[i]) : "";
    const slot = text ? QSR_SLOTS.find((s) => qsrSlotStart(s.key) === text) : undefined;
    if (!slot) {
      out.push(els[i]);
      continue;
    }
    const end = els.findIndex((el, j) => j > i && elementText(el) === qsrSlotEnd(slot.key));
    if (end === -1) throw new Error(`QSR template slot ${slot.key} is not closed`);
    let rendered = slotXml(slot, contentByKey.get(slot.key), els.slice(i + 1, end), input);
    if (slot.kind === "table" && slot.endBookmark) {
      rendered = appendToLastParagraph(rendered, bookmarkXml(bookmarkId, slot.endBookmark));
      bookmarkId += 1;
    }
    out.push(rendered);
    i = end;
  }
  zip.file(
    "word/document.xml",
    fillQsrIndexPageNumbers(
      `${xml.slice(0, bodyStart)}${out.join("")}${xml.slice(bodyEnd)}`
    )
  );
}
