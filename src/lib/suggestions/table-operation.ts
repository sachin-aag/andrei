import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import { RICH_FIELD_PATHS } from "@/lib/ai/suggest-target-fields";
import { dvTableHeadersForSection } from "@/lib/document-types/design-verification/sections";
import {
  ELR_TABLE_CAPTION_TITLES,
  elrTableHeadersForSection,
} from "@/lib/document-types/elr/sections";
import { inlineMarkdownToTextNodesWithBreaks } from "@/lib/tiptap/markdown-to-doc";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { flattenForAnchor, topLevelIndexAfterAnchor } from "@/lib/suggestions/locator";
import {
  insertNodesAfterTopLevelIndex,
  insertNodesIntoFieldBody,
} from "@/lib/suggestions/block-insert";
import { normalizeTrailingCitationBlockInDoc } from "@/lib/suggestions/citations-at-end";
import { getRichFieldValue, setRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { displaySectionLabel } from "@/types/sections";

/** Structured table mutation proposed via `edit_table` and stored on an `ai_fix`. */
export type TableOperation =
  | {
      kind: "edit_cells";
      tableIndex: number;
      cells: TableCellEdit[];
    }
  | {
      kind: "insert_rows";
      tableIndex: number;
      /** Omit to append after the last existing row. Ignored when afterRowKey matches. */
      afterRow?: number;
      /**
       * First-cell text of the live row to insert after (URS-16, a banner
       * label, …). Prefer this over afterRow — numeric indexes shift after
       * earlier inserts in the same batch.
       */
      afterRowKey?: string;
      rows: InsertTableRow[];
      expectedRowAtAfter?: string[];
    }
  | {
      kind: "delete_rows";
      tableIndex: number;
      rows: TableRowDelete[];
    }
  | {
      kind: "delete_table";
      tableIndex: number;
    }
  | {
      kind: "insert_column";
      tableIndex: number;
      /** Omit to append as the last column. */
      afterCol?: number;
      header: string;
      values?: string[];
      expectedHeaderAtAfterCol?: string;
      expectedHeaders?: string[];
    }
  | {
      kind: "delete_column";
      tableIndex: number;
      col: number;
      expectedHeaderText: string;
      expectedHeaders?: string[];
    }
  | {
      kind: "create_table";
      /** Header cells. First row of the new table. */
      headers: string[];
      /** Data rows; each padded or trimmed to headers.length. */
      rows?: string[][];
      /**
       * Unique span already in the field. The table is inserted after the
       * block that contains it. Omit to append before a trailing Citations list.
       */
      afterAnchor?: string;
      /** Caption title. The server inserts `Table N. {title}` above the table. */
      title?: string;
    };

export type TableCellEdit = {
  row: number;
  col: number;
  /** Omit to capture the current cell before proposing. */
  expectedText?: string;
  insertText: string;
  /**
   * Live sibling cells on this row (documentRef, system id, …). Grounding
   * uses this to keep a date on the cited file instead of a colliding SOP.
   */
  rowContext?: string;
};

/** Data cells, or a full-width merged banner (one cell, colspan = header width). */
export type InsertTableRow = string[] | { banner: string };

export function isBannerInsertRow(
  row: InsertTableRow
): row is { banner: string } {
  return !Array.isArray(row) && typeof row.banner === "string";
}

export function insertRowPlainTexts(row: InsertTableRow): string[] {
  return isBannerInsertRow(row) ? [row.banner] : row;
}

export type TableRowDelete = {
  row: number;
  expectedCells: string[];
};

/** One section's JSON, in document order, used to assign `Table N`. */
export type DocumentTableContent = {
  section: string;
  content: unknown;
};

export type TableOperationContext = {
  section: SectionType;
  targetField: string;
  /**
   * Legacy fallback: `maxCaption + 1` among already-published `Table N.`
   * captions. Used only when `documentContents` is omitted.
   */
  existingTableCount?: number;
  /**
   * Filled tables in document order. `Table N` is this table's 1-based
   * ordinal among data-bearing grids (empty unused shells do not count).
   * The target is treated as filled even if it is still a shell.
   */
  documentContents?: readonly DocumentTableContent[];
};

export type TableOperationStatus =
  | "ok"
  | "no_table"
  | "bad_scope"
  | "stale"
  | "fixed_schema"
  | "invalid";

export type TableOperationResult =
  | { ok: true; status: "ok"; doc: JSONContent; tableNumber?: number }
  | { ok: false; status: Exclude<TableOperationStatus, "ok">; hint: string };

export const TABLE_CAPTION_RE = /^Table\s+(\d+)\.\s+/i;

function tableCaptionParagraph(number: number, title: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", text: `Table ${number}. ${title.trim()}` }],
  };
}

function walkJsonContent(
  value: unknown,
  visit: (node: JSONContent) => void
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) walkJsonContent(child, visit);
    return;
  }
  const node = value as JSONContent;
  visit(node);
  if (Array.isArray(node.content)) {
    for (const child of node.content) walkJsonContent(child, visit);
    return;
  }
  if (!node.type) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      walkJsonContent(child, visit);
    }
  }
}

/** Count tables and `Table N. …` captions in a TipTap doc or section JSON. */
export function countNumberedTablesInContent(value: unknown): {
  tableCount: number;
  maxCaption: number;
} {
  let tableCount = 0;
  let maxCaption = 0;
  walkJsonContent(value, (node) => {
    if (node.type === "table") {
      tableCount += 1;
      return;
    }
    if (node.type !== "paragraph") return;
    const match = TABLE_CAPTION_RE.exec(flattenForAnchor(node).text.trim());
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) maxCaption = Math.max(maxCaption, n);
    }
  });
  return { tableCount, maxCaption };
}

/**
 * Next `Table N` is `maxCaption + 1`. Uncaptioned seeded shells do not consume N.
 * Prefer `filledTableNumberInDocument` when assigning a caption — fill order
 * among published captions is not document order.
 */
export function existingTableCountFromContents(
  contents: readonly unknown[]
): number {
  let maxCaption = 0;
  for (const content of contents) {
    maxCaption = Math.max(
      maxCaption,
      countNumberedTablesInContent(content).maxCaption
    );
  }
  return maxCaption;
}

function isTipTapDoc(value: unknown): value is JSONContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as JSONContent).type === "doc"
  );
}

function richFieldDocsInSection(
  section: string,
  content: unknown
): { field: string; doc: JSONContent }[] {
  if (!content || typeof content !== "object") return [];
  const paths = RICH_FIELD_PATHS[section];
  if (paths && paths.length > 0 && !isTipTapDoc(content)) {
    return paths.map((field) => ({
      field,
      doc: getRichFieldValue(content as Record<string, unknown>, field),
    }));
  }
  if (isTipTapDoc(content)) {
    return [{ field: "", doc: content }];
  }
  return [];
}

function walkFilledTablesInDocument(
  contents: readonly DocumentTableContent[],
  visit: (args: {
    section: string;
    field: string;
    tableIndex: number;
    table: JSONContent;
  }) => boolean | void
): void {
  for (const row of contents) {
    for (const { field, doc } of richFieldDocsInSection(row.section, row.content)) {
      const tables = collectTables(doc);
      for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
        const table = tables[tableIndex];
        if (!table) continue;
        if (visit({ section: row.section, field, tableIndex, table }) === false) {
          return;
        }
      }
    }
  }
}

/** Count data-bearing tables in document order. Empty unused shells do not count. */
export function countFilledTablesInDocument(
  contents: readonly DocumentTableContent[]
): number {
  let count = 0;
  walkFilledTablesInDocument(contents, ({ table }) => {
    if (tableHasData(table)) count += 1;
  });
  return count;
}

/**
 * 1-based ordinal of the target table among filled grids in document order.
 * The target counts even if it is still an empty shell. Missing target → undefined.
 */
export function filledTableNumberInDocument(args: {
  contents: readonly DocumentTableContent[];
  target: { section: string; targetField: string; tableIndex: number };
}): number | undefined {
  let ordinal = 0;
  let found: number | undefined;
  walkFilledTablesInDocument(args.contents, ({ section, field, tableIndex, table }) => {
    const fieldMatches =
      field === args.target.targetField ||
      (field === "" &&
        (args.target.targetField === "" ||
          args.target.targetField === "narrative" ||
          args.target.targetField === "table"));
    const matched =
      section === args.target.section &&
      fieldMatches &&
      tableIndex === args.target.tableIndex;
    if (!tableHasData(table) && !matched) return;
    ordinal += 1;
    if (matched) {
      found = ordinal;
      return false;
    }
  });
  return found;
}

function expectedTableNumber(
  doc: JSONContent,
  tableIndex: number,
  context?: TableOperationContext
): number {
  if (context?.documentContents) {
    return (
      filledTableNumberInDocument({
        contents: context.documentContents,
        target: {
          section: context.section,
          targetField: context.targetField,
          tableIndex,
        },
      }) ?? countFilledTablesInDocument(context.documentContents) + 1
    );
  }
  return (
    (context?.existingTableCount ?? existingTableCountFromContents([doc])) + 1
  );
}

const EMPTY_CELL_LABEL = "(empty)";

const DEFAULT_CELL_ATTRS = {
  colspan: 1,
  rowspan: 1,
  colwidth: null,
} as const;

/** True when this field is a seeded matrix with a locked column schema. */
export function isFixedColumnTable(
  section: string,
  targetField: string
): boolean {
  if (targetField !== "table") return false;
  return (
    dvTableHeadersForSection(section).length > 0 ||
    elrTableHeadersForSection(section).length > 0
  );
}

export function defaultTableCaptionTitle(section: string): string {
  const elrTitle =
    ELR_TABLE_CAPTION_TITLES[section as keyof typeof ELR_TABLE_CAPTION_TITLES];
  return elrTitle ?? displaySectionLabel(section);
}

function captionMatch(node: JSONContent | undefined): number | null {
  if (!node || node.type !== "paragraph") return null;
  const match = TABLE_CAPTION_RE.exec(flattenForAnchor(node).text.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/** Caption number sitting immediately above this table, if any. */
export function captionNumberAboveTable(
  doc: JSONContent | null | undefined,
  tableIndex: number
): number | null {
  if (!doc) return null;
  const location = collectTableLocations(doc)[tableIndex];
  if (!location?.parent.content) return null;
  return captionMatch(location.parent.content[location.index - 1]);
}

function tableHasData(table: JSONContent): boolean {
  const rows = tableRows(table);
  for (let i = 1; i < rows.length; i += 1) {
    for (const cell of rowCells(rows[i]!)) {
      if (cellPlainText(cell)) return true;
    }
  }
  return false;
}

function captionTitleFromParagraph(node: JSONContent): string {
  const text = flattenForAnchor(node).text.trim();
  const match = TABLE_CAPTION_RE.exec(text);
  if (!match) return "";
  return text.slice(match[0].length).trim();
}

function writeCaptionParagraph(
  node: JSONContent,
  number: number,
  title: string
): void {
  node.type = "paragraph";
  node.content = [{ type: "text", text: `Table ${number}. ${title.trim()}` }];
}

/**
 * Insert or rewrite `Table N. {title}` immediately above a filled table.
 * With `documentContents`, N is the filled-grid ordinal and a stale caption
 * is rewritten. Without it, an existing caption is kept (fill-order fallback).
 */
export function ensureCaptionOnFilledTable(
  doc: JSONContent,
  tableIndex: number,
  context?: TableOperationContext
): { doc: JSONContent; tableNumber?: number } {
  const tables = collectTables(doc);
  const table = tables[tableIndex];
  if (!table || !tableHasData(table)) return { doc };
  const location = collectTableLocations(doc)[tableIndex];
  if (!location?.parent.content) return { doc };
  const defaultTitle = defaultTableCaptionTitle(context?.section ?? "");
  const existingCaption = captionNumberAboveTable(doc, tableIndex);
  const useDocumentOrder = Boolean(context?.documentContents);
  const tableNumber = expectedTableNumber(doc, tableIndex, context);
  if (existingCaption !== null) {
    if (!useDocumentOrder || existingCaption === tableNumber) {
      return { doc, tableNumber: useDocumentOrder ? tableNumber : existingCaption };
    }
    const captionNode = location.parent.content[location.index - 1];
    if (captionNode) {
      const title =
        captionTitleFromParagraph(captionNode) || defaultTitle;
      writeCaptionParagraph(captionNode, tableNumber, title);
    }
    return { doc, tableNumber };
  }
  location.parent.content.splice(
    location.index,
    0,
    tableCaptionParagraph(tableNumber, defaultTitle)
  );
  return { doc, tableNumber };
}

/** Drop a leftover `Table N.` paragraph above an empty unused grid. */
function stripCaptionAboveEmptyTable(
  doc: JSONContent,
  tableIndex: number
): boolean {
  const table = collectTables(doc)[tableIndex];
  if (!table || tableHasData(table)) return false;
  const location = collectTableLocations(doc)[tableIndex];
  if (!location?.parent.content) return false;
  if (captionMatch(location.parent.content[location.index - 1]) === null) {
    return false;
  }
  location.parent.content.splice(location.index - 1, 1);
  return true;
}

/**
 * Word-style SEQ: rewrite every filled-grid caption to 1..N in document
 * order (keep the title after `Table N. `) and strip captions on empty shells.
 */
export function renumberFilledTableCaptions(
  contents: readonly DocumentTableContent[]
): {
  contents: DocumentTableContent[];
  changedSections: string[];
} {
  const next: DocumentTableContent[] = contents.map((row) => ({
    section: row.section,
    content: structuredClone(row.content),
  }));

  for (const row of next) {
    if (!row.content || typeof row.content !== "object") continue;
    for (const { field, doc } of richFieldDocsInSection(
      row.section,
      row.content
    )) {
      const working = structuredClone(doc);
      const tableCount = collectTables(working).length;
      for (let tableIndex = 0; tableIndex < tableCount; tableIndex += 1) {
        const table = collectTables(working)[tableIndex];
        if (!table) continue;
        if (tableHasData(table)) {
          ensureCaptionOnFilledTable(working, tableIndex, {
            section: row.section,
            targetField: field || "narrative",
            documentContents: next,
          });
        } else {
          stripCaptionAboveEmptyTable(working, tableIndex);
        }
      }
      if (field === "") {
        row.content = working;
      } else {
        row.content = setRichFieldValue(
          row.content as Record<string, unknown>,
          field,
          working
        );
      }
    }
  }

  const changedSections: string[] = [];
  for (let index = 0; index < contents.length; index += 1) {
    const before = contents[index];
    const after = next[index];
    if (!before || !after) continue;
    if (JSON.stringify(before.content) !== JSON.stringify(after.content)) {
      changedSections.push(after.section);
    }
  }
  return { contents: next, changedSections };
}

function markdownTableHasData(markdown: string): boolean {
  const rows = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  for (const line of rows.slice(2)) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0 && !/^:?-{3,}:?$/.test(cell));
    if (cells.length > 0) return true;
  }
  return false;
}

/** Prepend or rewrite `Table N. {title}` on GFM when rewriting a filled table field. */
export function prefixTableCaptionMarkdown(
  markdown: string,
  existingTableCount: number,
  title: string,
  tableNumber?: number
): { markdown: string; tableNumber?: number } {
  const leading = markdown.match(/^\s*/)?.[0] ?? "";
  const trimmed = markdown.replace(/^\s+/, "");
  const lines = trimmed.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? "";
  const match = TABLE_CAPTION_RE.exec(firstLine);
  const expected = tableNumber ?? existingTableCount + 1;
  if (match) {
    const n = Number(match[1]);
    if (tableNumber === undefined || !Number.isFinite(n) || n === tableNumber) {
      return {
        markdown,
        tableNumber: Number.isFinite(n) ? n : undefined,
      };
    }
    const restTitle = firstLine.slice(match[0].length).trim() || title.trim();
    lines[0] = `Table ${tableNumber}. ${restTitle}`;
    return {
      markdown: `${leading}${lines.join("\n")}`,
      tableNumber,
    };
  }
  if (!markdownTableHasData(markdown)) return { markdown };
  return {
    markdown: `Table ${expected}. ${title.trim()}\n\n${trimmed}`,
    tableNumber: expected,
  };
}

function captionAfterFill(
  result: TableOperationResult,
  tableIndex: number,
  context?: TableOperationContext
): TableOperationResult {
  if (!result.ok) return result;
  const captioned = ensureCaptionOnFilledTable(
    result.doc,
    tableIndex,
    context
  );
  return {
    ok: true,
    status: "ok",
    doc: captioned.doc,
    ...(captioned.tableNumber !== undefined
      ? { tableNumber: captioned.tableNumber }
      : {}),
  };
}

export function normalizeTableCellText(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed === EMPTY_CELL_LABEL) return "";
  return trimmed;
}

export function cellPlainText(cell: JSONContent): string {
  return normalizeTableCellText(flattenForAnchor(cell).text);
}

function isTableCellNode(node: JSONContent): boolean {
  return node.type === "tableCell" || node.type === "tableHeader";
}

function rowCells(row: JSONContent): JSONContent[] {
  return (row.content ?? []).filter(isTableCellNode);
}

function tableRows(table: JSONContent): JSONContent[] {
  return (table.content ?? []).filter((n) => n.type === "tableRow");
}

function cellColspan(cell: JSONContent): number {
  const raw = cell.attrs?.colspan;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : 1;
}

function visualColumnCount(row: JSONContent): number {
  return rowCells(row).reduce((sum, cell) => sum + cellColspan(cell), 0);
}

/** One physical cell that spans the full header width. */
export function isBannerTableRow(row: JSONContent): boolean {
  const cells = rowCells(row);
  return cells.length === 1 && cellColspan(cells[0]!) > 1;
}

function headerColumnCount(table: JSONContent): number {
  const header = tableRows(table)[0];
  if (!header) return 0;
  return Math.max(visualColumnCount(header), rowCells(header).length);
}

function firstCellText(row: JSONContent): string {
  const cell = rowCells(row)[0];
  return cell ? cellPlainText(cell) : "";
}

function rowsMatchingAfterKey(
  rows: readonly JSONContent[],
  key: string
): number[] {
  const wanted = normalizeTableCellText(key);
  if (!wanted) return [];
  const hits: number[] = [];
  rows.forEach((row, index) => {
    if (firstCellText(row) === wanted) hits.push(index);
  });
  return hits;
}

export type ResolveInsertAfterRowResult =
  | { ok: true; afterRow: number }
  | { ok: false; status: "bad_scope" | "invalid"; hint: string };

/** Resolve insert_rows afterRowKey (preferred) or afterRow against live rows. */
export function resolveInsertAfterRow(
  rows: readonly JSONContent[],
  operation: Extract<TableOperation, { kind: "insert_rows" }>
): ResolveInsertAfterRowResult {
  const key = operation.afterRowKey?.trim() ?? "";
  if (key) {
    const hits = rowsMatchingAfterKey(rows, key);
    if (hits.length === 0) {
      return {
        ok: false,
        status: "bad_scope",
        hint: `afterRowKey "${key}" was not found. Copy the first-cell text from read_section (URS ID or banner label).`,
      };
    }
    if (hits.length > 1) {
      return {
        ok: false,
        status: "bad_scope",
        hint: `afterRowKey "${key}" matches rows ${hits.join(", ")}. Quote a unique first-cell value.`,
      };
    }
    return { ok: true, afterRow: hits[0]! };
  }
  const afterRow = operation.afterRow ?? Math.max(0, rows.length - 1);
  if (afterRow < 0 || afterRow >= rows.length) {
    return {
      ok: false,
      status: "bad_scope",
      hint: `afterRow ${afterRow} does not exist. Re-read with read_section.`,
    };
  }
  return { ok: true, afterRow };
}

type TableLocation = {
  table: JSONContent;
  parent: JSONContent;
  index: number;
};

function collectTableLocations(doc: JSONContent): TableLocation[] {
  const found: TableLocation[] = [];
  const walk = (node: JSONContent) => {
    const content = node.content;
    if (!content) return;
    content.forEach((child, index) => {
      if (child.type === "table") {
        found.push({ table: child, parent: node, index });
        return;
      }
      walk(child);
    });
  };
  walk(doc);
  return found;
}

function collectTables(doc: JSONContent): JSONContent[] {
  return collectTableLocations(doc).map((location) => location.table);
}

export type TableInventoryEntry = {
  tableIndex: number;
  headers: string[];
  dataRowCount: number;
};

export type TableCellCoordinate = {
  row: number;
  col: number;
  text: string;
};

export type TableInventory = TableInventoryEntry & {
  cells: TableCellCoordinate[];
};

/** Coordinate inventory for read_section / structuredText so models pick tableIndex first. */
export function summarizeTablesInDoc(doc: JSONContent): TableInventory[] {
  return collectTables(doc).map((table, tableIndex) => {
    const rows = tableRows(table);
    const headers = headersOf(table);
    const cells: TableCellCoordinate[] = [];
    rows.forEach((row, r) => {
      rowCells(row).forEach((cell, col) => {
        cells.push({ row: r, col, text: cellPlainText(cell) || "(empty)" });
      });
    });
    return {
      tableIndex,
      headers,
      dataRowCount: Math.max(0, rows.length - 1),
      cells,
    };
  });
}

function rowSnapshot(row: JSONContent): string[] {
  return rowCells(row).map(cellPlainText);
}

function headersOf(table: JSONContent): string[] {
  const rows = tableRows(table);
  const header = rows[0];
  return header ? rowSnapshot(header) : [];
}

function liveHeadersHint(headers: readonly string[]): string {
  if (headers.length === 0) return "Re-read with read_section.";
  const line = headers.map((header) => header.trim() || "(empty)").join(" | ");
  return `Live headers (${headers.length}): ${line}. Call read_section and copy those columns.`;
}

function cellsMatch(
  actual: readonly string[],
  expected: readonly string[] | undefined
): boolean {
  if (!expected) return true;
  if (actual.length !== expected.length) return false;
  return actual.every(
    (cell, i) => cell === normalizeTableCellText(expected[i] ?? "")
  );
}

/**
 * `insert_rows` snapshots the live anchor row at persist. Apply-all (and
 * sequential Apply) may fill that empty seeded row first via a sibling
 * `edit_cells`. Previously empty snapshot cells may now have text; filled
 * snapshot cells must still match or the insert is stale.
 */
function expectedRowAtAfterStillValid(
  actual: readonly string[],
  expected: readonly string[] | undefined
): boolean {
  if (!expected) return true;
  const exp0 = normalizeTableCellText(expected[0] ?? "");
  if (exp0.length > 0 && (actual[0] ?? "") !== exp0) return false;
  if (actual.length !== expected.length) {
    const restEmpty = expected
      .slice(1)
      .every((cell) => normalizeTableCellText(cell).length === 0);
    return exp0.length > 0 && restEmpty;
  }
  if (cellsMatch(actual, expected)) return true;
  for (let i = 0; i < expected.length; i++) {
    const exp = normalizeTableCellText(expected[i] ?? "");
    if (exp.length === 0) continue;
    if ((actual[i] ?? "") !== exp) return false;
  }
  return true;
}

function cellParagraphFromText(text: string): JSONContent {
  const normalized = normalizeSuggestionInsertText(text);
  if (!normalized) return { type: "paragraph" };
  return {
    type: "paragraph",
    content: inlineMarkdownToTextNodesWithBreaks(normalized),
  };
}

function makeCell(
  type: "tableHeader" | "tableCell",
  text: string,
  attrs?: JSONContent["attrs"]
): JSONContent {
  return {
    type,
    attrs: attrs ? structuredClone(attrs) : { ...DEFAULT_CELL_ATTRS },
    content: [cellParagraphFromText(text)],
  };
}

function setCellText(cell: JSONContent, text: string): void {
  cell.content = [cellParagraphFromText(text)];
}

function fail(
  status: Exclude<TableOperationStatus, "ok">,
  hint: string
): TableOperationResult {
  return { ok: false, status, hint };
}

function templateAttrs(cells: JSONContent[], index: number): JSONContent["attrs"] {
  const template = cells[Math.min(Math.max(index, 0), Math.max(cells.length - 1, 0))];
  return template?.attrs ? structuredClone(template.attrs) : { ...DEFAULT_CELL_ATTRS };
}

/** Copy paint attrs from a data row; never inherit a banner colspan/rowspan. */
function dataCellAttrs(
  templateCells: JSONContent[],
  index: number
): JSONContent["attrs"] {
  const attrs = templateAttrs(templateCells, index) ?? { ...DEFAULT_CELL_ATTRS };
  return { ...attrs, colspan: 1, rowspan: 1 };
}

function dataTemplateCells(
  rows: readonly JSONContent[],
  afterRow: number
): JSONContent[] {
  for (let i = afterRow; i >= 1; i -= 1) {
    const cells = rowCells(rows[i]!);
    if (cells.length > 1 && !isBannerTableRow(rows[i]!)) return cells;
  }
  return rowCells(rows[0] ?? { type: "tableRow", content: [] });
}

function makeBannerCell(text: string, colspan: number): JSONContent {
  const paragraph = cellParagraphFromText(text);
  if (Array.isArray(paragraph.content)) {
    paragraph.content = paragraph.content.map((node) =>
      node.type === "text"
        ? { ...node, marks: [...(node.marks ?? []), { type: "bold" }] }
        : node
    );
  }
  return {
    type: "tableCell",
    attrs: { ...DEFAULT_CELL_ATTRS, colspan },
    content: [paragraph],
  };
}

/**
 * Fill optional concurrency snapshots from the current table before a proposal
 * is persisted. This keeps model input concise while preserving stale-edit
 * protection when the engineer accepts the proposal later.
 */
export function captureTableOperationSnapshots(
  doc: JSONContent,
  operation: TableOperation
): TableOperation {
  const captured = structuredClone(operation);
  if (captured.kind === "create_table") return captured;
  const table = collectTables(doc)[captured.tableIndex];
  if (!table) return captured;

  const rows = tableRows(table);
  const headers = headersOf(table);

  switch (captured.kind) {
    case "edit_cells":
      captured.cells = captured.cells.map((cell) => {
        const row = rows[cell.row];
        const node = row ? rowCells(row)[cell.col] : undefined;
        const rowContext =
          cell.rowContext ??
          (row ? rowSnapshot(row).filter(Boolean).join("\n") : undefined);
        if (cell.expectedText !== undefined) {
          return rowContext ? { ...cell, rowContext } : cell;
        }
        return node
          ? {
              ...cell,
              expectedText: cellPlainText(node),
              ...(rowContext ? { rowContext } : {}),
            }
          : rowContext
            ? { ...cell, rowContext }
            : cell;
      });
      return captured;
    case "insert_rows": {
      const resolved = resolveInsertAfterRow(rows, captured);
      if (resolved.ok) {
        captured.afterRow = resolved.afterRow;
        if (captured.expectedRowAtAfter === undefined) {
          const anchor = rows[resolved.afterRow];
          if (anchor) captured.expectedRowAtAfter = rowSnapshot(anchor);
        }
      } else if (
        captured.afterRow === undefined &&
        !captured.afterRowKey?.trim()
      ) {
        captured.afterRow = Math.max(0, rows.length - 1);
        if (captured.expectedRowAtAfter === undefined) {
          const anchor = rows[captured.afterRow];
          if (anchor) captured.expectedRowAtAfter = rowSnapshot(anchor);
        }
      }
      return captured;
    }
    case "delete_rows":
      captured.rows = captured.rows.map((target) => {
        if (target.expectedCells.length > 0) return target;
        const row = rows[target.row];
        return row ? { ...target, expectedCells: rowSnapshot(row) } : target;
      });
      if (deletesEveryDataRow(table, captured)) {
        return { kind: "delete_table", tableIndex: captured.tableIndex };
      }
      return captured;
    case "delete_table":
      return captured;
    case "insert_column":
      if (captured.afterCol === undefined) {
        captured.afterCol = Math.max(-1, headers.length - 1);
      }
      if (captured.expectedHeaders === undefined) {
        captured.expectedHeaders = headers;
      }
      if (
        captured.afterCol >= 0 &&
        captured.expectedHeaderAtAfterCol === undefined
      ) {
        captured.expectedHeaderAtAfterCol = headers[captured.afterCol];
      }
      return captured;
    case "delete_column":
      if (captured.expectedHeaders === undefined) {
        captured.expectedHeaders = headers;
      }
      return captured;
    default: {
      const _exhaustive: never = captured;
      return _exhaustive;
    }
  }
}

/**
 * Apply a structural table operation to a rich field doc.
 * Untouched cells keep their nodes, marks, and attributes.
 */
function applyCreateTable(
  doc: JSONContent,
  operation: Extract<TableOperation, { kind: "create_table" }>,
  context?: TableOperationContext
): TableOperationResult {
  if (context && isFixedColumnTable(context.section, context.targetField)) {
    return fail(
      "fixed_schema",
      "This matrix has a fixed column schema. Do not create another table. Edit cells or insert rows on the existing matrix."
    );
  }
  if (operation.headers.length === 0) {
    return fail("invalid", "create_table requires at least one header.");
  }
  const colCount = operation.headers.length;
  const rows = (operation.rows ?? []).map((row) =>
    row.length >= colCount
      ? row.slice(0, colCount)
      : [...row, ...Array.from({ length: colCount - row.length }, () => "")]
  );
  const table: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: operation.headers.map((header) => makeCell("tableHeader", header)),
      },
      ...rows.map((row) => ({
        type: "tableRow" as const,
        content: row.map((cell) => makeCell("tableCell", cell)),
      })),
    ],
  };
  const title = operation.title?.trim() ?? "";
  const existing = context?.documentContents
    ? countFilledTablesInDocument(context.documentContents)
    : (context?.existingTableCount ?? existingTableCountFromContents([doc]));
  const tableNumber = title ? existing + 1 : undefined;
  const nodes: JSONContent[] =
    title && tableNumber !== undefined
      ? [tableCaptionParagraph(tableNumber, title), table]
      : [table];
  const afterAnchor = operation.afterAnchor?.trim() ?? "";
  if (afterAnchor) {
    const located = topLevelIndexAfterAnchor(doc, afterAnchor);
    if (located.status !== "ok") {
      return fail(
        "bad_scope",
        located.status === "ambiguous"
          ? "afterAnchor matches more than once. Quote a longer unique span, or omit afterAnchor to append before Citations."
          : "afterAnchor was not found in the field. Call read_section and quote a unique span, or omit afterAnchor to append before Citations."
      );
    }
    insertNodesAfterTopLevelIndex(doc, located.index, nodes);
    return { ok: true, status: "ok", doc, tableNumber };
  }
  insertNodesIntoFieldBody(doc, nodes);
  return { ok: true, status: "ok", doc, tableNumber };
}

export function applyTableOperation(
  doc: JSONContent,
  operation: TableOperation,
  context?: TableOperationContext
): TableOperationResult {
  const next = normalizeTrailingCitationBlockInDoc(structuredClone(doc));
  if (operation.kind === "create_table") {
    return applyCreateTable(next, operation, context);
  }

  const tables = collectTables(next);
  if (tables.length === 0) {
    return fail(
      "no_table",
      "This field has no table. Use edit_table with kind create_table (headers plus rows) to add one."
    );
  }
  const table = tables[operation.tableIndex];
  if (!table) {
    return fail(
      "bad_scope",
      `tableIndex ${operation.tableIndex} does not exist (field has ${tables.length} table(s)). Re-read with read_section.`
    );
  }

  const fixedColumns = Boolean(
    context && isFixedColumnTable(context.section, context.targetField)
  );

  switch (operation.kind) {
    case "edit_cells":
      return captionAfterFill(
        applyEditCells(next, table, operation, fixedColumns),
        operation.tableIndex,
        context
      );
    case "insert_rows":
      return captionAfterFill(
        applyInsertRows(next, table, operation),
        operation.tableIndex,
        context
      );
    case "delete_rows":
      return applyDeleteRows(next, table, operation);
    case "delete_table":
      if (fixedColumns) {
        return fail(
          "fixed_schema",
          "This matrix has a fixed column schema. Do not remove the table. Edit cells or delete rows instead."
        );
      }
      return applyDeleteTable(next, operation.tableIndex);
    case "insert_column":
      if (fixedColumns) {
        return fail(
          "fixed_schema",
          "This matrix has a fixed column schema. Do not add columns. Edit cells or insert rows instead."
        );
      }
      return captionAfterFill(
        applyInsertColumn(next, table, operation),
        operation.tableIndex,
        context
      );
    case "delete_column":
      if (fixedColumns) {
        return fail(
          "fixed_schema",
          "This matrix has a fixed column schema. Do not delete columns. Edit cells or delete rows instead."
        );
      }
      return applyDeleteColumn(next, table, operation);
    default: {
      const _exhaustive: never = operation;
      return fail("invalid", `Unknown table operation: ${String(_exhaustive)}`);
    }
  }
}

function applyEditCells(
  doc: JSONContent,
  table: JSONContent,
  operation: Extract<TableOperation, { kind: "edit_cells" }>,
  fixedColumns: boolean
): TableOperationResult {
  if (operation.cells.length === 0) {
    return fail("invalid", "edit_cells requires at least one cell.");
  }
  const seen = new Set<string>();
  const rows = tableRows(table);
  for (const cell of operation.cells) {
    const key = `${cell.row},${cell.col}`;
    if (seen.has(key)) {
      return fail("invalid", `Duplicate cell target [${cell.row},${cell.col}].`);
    }
    seen.add(key);
    const row = rows[cell.row];
    if (!row) {
      return fail(
        "bad_scope",
        `Row ${cell.row} does not exist (table has ${rows.length} row(s), 0-based). Seeded matrices have a header (row 0) and one empty data row (row 1). Use insert_rows to add more data rows, then edit_cells.`
      );
    }
    const cells = rowCells(row);
    const node = cells[cell.col];
    if (!node) {
      return fail(
        "bad_scope",
        `Cell [${cell.row},${cell.col}] does not exist. ${liveHeadersHint(headersOf(table))}`
      );
    }
    if (fixedColumns && cell.row === 0) {
      const nextText = normalizeTableCellText(
        normalizeSuggestionInsertText(cell.insertText)
      );
      const current = cellPlainText(node);
      if (nextText !== current) {
        return fail(
          "fixed_schema",
          "This matrix has a fixed column schema. Do not rename header cells."
        );
      }
    }
    if (cell.expectedText !== undefined) {
      const expected = normalizeTableCellText(cell.expectedText);
      if (cellPlainText(node) !== expected) {
        return fail(
          "stale",
          `Cell [${cell.row},${cell.col}] no longer matches expectedText. Re-read with read_section.`
        );
      }
    }
  }
  for (const cell of operation.cells) {
    const node = rowCells(rows[cell.row]!)[cell.col]!;
    setCellText(node, cell.insertText);
  }
  return { ok: true, status: "ok", doc };
}

function applyInsertRows(
  doc: JSONContent,
  table: JSONContent,
  operation: Extract<TableOperation, { kind: "insert_rows" }>
): TableOperationResult {
  if (operation.rows.length === 0) {
    return fail("invalid", "insert_rows requires at least one row.");
  }
  const rows = tableRows(table);
  const resolved = resolveInsertAfterRow(rows, operation);
  if (!resolved.ok) {
    return fail(resolved.status, resolved.hint);
  }
  const afterRow = resolved.afterRow;
  const anchor = rows[afterRow]!;
  if (!expectedRowAtAfterStillValid(rowSnapshot(anchor), operation.expectedRowAtAfter)) {
    return fail(
      "stale",
      `Row ${afterRow} no longer matches the expected snapshot. Re-read with read_section.`
    );
  }
  const visualCols = headerColumnCount(table);
  const templateCells = dataTemplateCells(rows, afterRow);
  const headerPhysical = rows[0] ? rowCells(rows[0]).length : 0;
  const dataCols =
    visualCols === headerPhysical
      ? visualCols
      : templateCells.length || headerPhysical;
  if (visualCols === 0 && dataCols === 0) {
    return fail("invalid", "Cannot insert into a table with no columns.");
  }
  for (const [i, row] of operation.rows.entries()) {
    if (isBannerInsertRow(row)) continue;
    if (row.length !== dataCols) {
      return fail(
        "invalid",
        `Inserted row ${i} has ${row.length} cell(s); the table has ${dataCols} column(s). ${liveHeadersHint(headersOf(table))}`
      );
    }
  }
  const newRows = operation.rows.map((row) =>
    isBannerInsertRow(row)
      ? {
          type: "tableRow" as const,
          content: [makeBannerCell(row.banner, visualCols || dataCols)],
        }
      : {
          type: "tableRow" as const,
          content: row.map((text, col) =>
            makeCell("tableCell", text, dataCellAttrs(templateCells, col))
          ),
        }
  );
  const content = [...(table.content ?? [])];
  const rowPositions = content
    .map((node, index) => (node.type === "tableRow" ? index : -1))
    .filter((index) => index >= 0);
  const insertAtContent = (rowPositions[afterRow] ?? 0) + 1;
  content.splice(insertAtContent, 0, ...newRows);
  table.content = content;
  return { ok: true, status: "ok", doc };
}

function applyDeleteRows(
  doc: JSONContent,
  table: JSONContent,
  operation: Extract<TableOperation, { kind: "delete_rows" }>
): TableOperationResult {
  if (operation.rows.length === 0) {
    return fail("invalid", "delete_rows requires at least one row.");
  }
  const unique = new Map<number, TableRowDelete>();
  for (const target of operation.rows) {
    if (target.row === 0) {
      return fail("invalid", "Cannot delete the header row.");
    }
    unique.set(target.row, target);
  }
  const rows = tableRows(table);
  const ordered = [...unique.values()].sort((a, b) => b.row - a.row);
  for (const target of ordered) {
    const row = rows[target.row];
    if (!row) {
      return fail(
        "bad_scope",
        `Row ${target.row} does not exist. Re-read with read_section.`
      );
    }
    if (!cellsMatch(rowSnapshot(row), target.expectedCells)) {
      return fail(
        "stale",
        `Row ${target.row} no longer matches the expected snapshot. Re-read with read_section.`
      );
    }
  }
  const content = [...(table.content ?? [])];
  for (const target of ordered) {
    const rowPositions = content
      .map((node, index) => (node.type === "tableRow" ? index : -1))
      .filter((index) => index >= 0);
    const at = rowPositions[target.row];
    if (at === undefined) {
      return fail("bad_scope", `Row ${target.row} disappeared during delete.`);
    }
    content.splice(at, 1);
  }
  table.content = content;
  return { ok: true, status: "ok", doc };
}

function deletesEveryDataRow(
  table: JSONContent,
  operation: Extract<TableOperation, { kind: "delete_rows" }>
): boolean {
  const n = tableRows(table).length;
  if (n <= 1) return false;
  const wanted = new Set(operation.rows.map((target) => target.row));
  for (let row = 1; row < n; row += 1) {
    if (!wanted.has(row)) return false;
  }
  return true;
}

function applyDeleteTable(
  doc: JSONContent,
  tableIndex: number
): TableOperationResult {
  const locations = collectTableLocations(doc);
  const location = locations[tableIndex];
  if (!location) {
    return fail(
      "bad_scope",
      `tableIndex ${tableIndex} does not exist (field has ${locations.length} table(s)). Re-read with read_section.`
    );
  }
  if (!location.parent.content) {
    return fail("invalid", "Cannot remove this table.");
  }
  const remove = new Set([location.index]);
  if (captionMatch(location.parent.content[location.index - 1]) !== null) {
    remove.add(location.index - 1);
  }
  location.parent.content = location.parent.content.filter(
    (_, index) => !remove.has(index)
  );
  return {
    ok: true,
    status: "ok",
    doc: normalizeTrailingCitationBlockInDoc(doc),
  };
}

function applyInsertColumn(
  doc: JSONContent,
  table: JSONContent,
  operation: Extract<TableOperation, { kind: "insert_column" }>
): TableOperationResult {
  const header = normalizeSuggestionInsertText(operation.header);
  if (!header) {
    return fail("invalid", "insert_column requires a non-empty header.");
  }
  const rows = tableRows(table);
  if (rows.length === 0) {
    return fail("invalid", "Cannot insert a column into an empty table.");
  }
  const currentHeaders = headersOf(table);
  const afterCol = operation.afterCol ?? Math.max(-1, currentHeaders.length - 1);
  if (afterCol < -1 || afterCol >= currentHeaders.length) {
    return fail(
      "bad_scope",
      `afterCol ${afterCol} does not exist. Re-read with read_section.`
    );
  }
  if (
    afterCol >= 0 &&
    operation.expectedHeaderAtAfterCol !== undefined &&
    normalizeTableCellText(operation.expectedHeaderAtAfterCol) !==
      currentHeaders[afterCol]
  ) {
    return fail(
      "stale",
      `Column ${afterCol} header no longer matches expectedHeaderAtAfterCol. Re-read with read_section.`
    );
  }
  if (!cellsMatch(currentHeaders, operation.expectedHeaders)) {
    return fail(
      "stale",
      "Table headers no longer match expectedHeaders. Re-read with read_section."
    );
  }
  const dataRowCount = Math.max(0, rows.length - 1);
  const values = operation.values ?? Array.from({ length: dataRowCount }, () => "");
  if (values.length !== dataRowCount) {
    return fail(
      "invalid",
      `insert_column values length (${values.length}) must match the number of data rows (${dataRowCount}).`
    );
  }
  const insertAt = afterCol + 1;
  rows.forEach((row, rowIdx) => {
    const cells = rowCells(row);
    const isHeader = rowIdx === 0;
    const text = isHeader ? header : (values[rowIdx - 1] ?? "");
    const newCell = makeCell(
      isHeader ? "tableHeader" : "tableCell",
      text,
      templateAttrs(cells, insertAt)
    );
    cells.splice(insertAt, 0, newCell);
    row.content = cells;
  });
  return { ok: true, status: "ok", doc };
}

function applyDeleteColumn(
  doc: JSONContent,
  table: JSONContent,
  operation: Extract<TableOperation, { kind: "delete_column" }>
): TableOperationResult {
  const rows = tableRows(table);
  const currentHeaders = headersOf(table);
  if (currentHeaders.length <= 1) {
    return fail("invalid", "Cannot delete the last remaining column.");
  }
  if (operation.col < 0 || operation.col >= currentHeaders.length) {
    return fail(
      "bad_scope",
      `Column ${operation.col} does not exist. Re-read with read_section.`
    );
  }
  if (
    normalizeTableCellText(operation.expectedHeaderText) !==
    currentHeaders[operation.col]
  ) {
    return fail(
      "stale",
      `Column ${operation.col} header no longer matches expectedHeaderText. Re-read with read_section.`
    );
  }
  if (!cellsMatch(currentHeaders, operation.expectedHeaders)) {
    return fail(
      "stale",
      "Table headers no longer match expectedHeaders. Re-read with read_section."
    );
  }
  rows.forEach((row) => {
    const cells = rowCells(row);
    if (operation.col < cells.length) {
      cells.splice(operation.col, 1);
      row.content = cells;
    }
  });
  return { ok: true, status: "ok", doc };
}

const TABLE_OPERATION_KINDS = [
  "edit_cells",
  "insert_rows",
  "delete_rows",
  "delete_table",
  "insert_column",
  "delete_column",
  "create_table",
] as const;

type TableOperationKind = (typeof TABLE_OPERATION_KINDS)[number];

const TABLE_KIND_ALIASES: Record<string, TableOperationKind> = {
  edit_cell: "edit_cells",
  update_cells: "edit_cells",
  update_cell: "edit_cells",
  add_column: "insert_column",
  add_columns: "insert_column",
  insert_col: "insert_column",
  add_row: "insert_rows",
  add_rows: "insert_rows",
  insert_row: "insert_rows",
  remove_column: "delete_column",
  drop_column: "delete_column",
  remove_row: "delete_rows",
  remove_rows: "delete_rows",
  remove_table: "delete_table",
  drop_table: "delete_table",
  new_table: "create_table",
  add_table: "create_table",
};

function isTableOperationKind(value: unknown): value is TableOperationKind {
  return (
    typeof value === "string" &&
    (TABLE_OPERATION_KINDS as readonly string[]).includes(value)
  );
}

function resolveTableKind(value: unknown): TableOperationKind | null {
  if (isTableOperationKind(value)) return value;
  if (typeof value === "string" && value in TABLE_KIND_ALIASES) {
    return TABLE_KIND_ALIASES[value] ?? null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nestedKindPayload(
  raw: Record<string, unknown>,
  kind: TableOperationKind
): Record<string, unknown> | null {
  if (isRecord(raw[kind])) return raw[kind];
  for (const [alias, mapped] of Object.entries(TABLE_KIND_ALIASES)) {
    if (mapped === kind && isRecord(raw[alias])) return raw[alias];
  }
  return null;
}

/** `{ insert_rows: [row, row] }` — an array, not `{ insert_rows: { rows } }`. */
function nestedInsertRowsAlias(
  raw: Record<string, unknown>
): unknown[] | null {
  if (Array.isArray(raw.insert_rows) && raw.insert_rows.length > 0) {
    return raw.insert_rows;
  }
  for (const [alias, mapped] of Object.entries(TABLE_KIND_ALIASES)) {
    if (mapped !== "insert_rows") continue;
    const nested = raw[alias];
    if (Array.isArray(nested) && nested.length > 0) return nested;
  }
  return null;
}

function stripNestedKindKeys(
  raw: Record<string, unknown>,
  kind: TableOperationKind
): Record<string, unknown> {
  const rest = { ...raw };
  delete rest[kind];
  for (const [alias, mapped] of Object.entries(TABLE_KIND_ALIASES)) {
    if (mapped === kind) delete rest[alias];
  }
  return rest;
}

/**
 * Models often nest the op: `{ create_table: { headers, rows } }` instead of
 * `{ kind: "create_table", headers, rows }`. Hoist that object onto the root.
 * Extra keys like `reasoning` are ignored.
 */
function hoistNestedTableKind(
  raw: Record<string, unknown>
): Record<string, unknown> {
  let current = raw;
  if (isRecord(raw.operation) && !isTableOperationKind(raw.kind)) {
    const merged: Record<string, unknown> = { ...raw, ...raw.operation };
    delete merged.operation;
    current = merged;
  }

  const existingKind =
    resolveTableKind(current.kind) ?? resolveTableKind(current.operation);

  if (existingKind) {
    const nested = nestedKindPayload(current, existingKind);
    if (nested) {
      return { ...nested, ...stripNestedKindKeys(current, existingKind), kind: existingKind };
    }
    if (existingKind === "insert_rows") {
      const nestedRows = nestedInsertRowsAlias(current);
      if (nestedRows && (!Array.isArray(current.rows) || current.rows.length === 0)) {
        return {
          ...stripNestedKindKeys(current, existingKind),
          kind: existingKind,
          rows: nestedRows,
        };
      }
    }
    return { ...current, kind: existingKind };
  }

  for (const kind of TABLE_OPERATION_KINDS) {
    const nested = nestedKindPayload(current, kind);
    if (!nested) continue;
    return { ...stripNestedKindKeys(current, kind), ...nested, kind };
  }
  const nestedRows = nestedInsertRowsAlias(current);
  if (nestedRows) {
    return {
      ...stripNestedKindKeys(current, "insert_rows"),
      kind: "insert_rows",
      rows: nestedRows,
    };
  }
  return current;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asCellString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cells: string[] = [];
  for (const item of value) {
    const cell = asCellString(item);
    if (cell === null) return undefined;
    cells.push(cell);
  }
  return cells;
}

function parseQuotedStringList(raw: string): string[] | undefined {
  const trimmed = raw.trim().replace(/,$/, "");
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return undefined;
  try {
    const parsed = JSON.parse(trimmed.replace(/'/g, '"')) as unknown;
    const cells = asStringArray(parsed);
    return cells && cells.length > 0 ? cells : undefined;
  } catch {
    return undefined;
  }
}

function coerceMatrixRow(row: unknown, headers?: string[]): string[] | undefined {
  const direct = asStringArray(row);
  if (direct && direct.length > 0) return direct;
  if (typeof row === "string") return parseQuotedStringList(row);
  if (!isRecord(row)) return undefined;
  if (headers && headers.length > 0) {
    return headers.map((header) => asCellString(row[header]) ?? "");
  }
  const cells: string[] = [];
  for (const value of Object.values(row)) {
    const cell = asCellString(value);
    if (cell === null) return undefined;
    cells.push(cell);
  }
  return cells.length > 0 ? cells : undefined;
}

function asStringMatrix(value: unknown, headers?: string[]): string[][] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows: string[][] = [];
  for (const row of value) {
    const cells = coerceMatrixRow(row, headers);
    if (!cells || cells.length === 0) return null;
    rows.push(cells);
  }
  return rows;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function cellsFromInsertRowObject(item: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(item.cells)) {
    return coerceMatrixRow(item.cells);
  }
  const single = asCellString(item.cells);
  if (single !== null && single.trim()) return [single];
  return undefined;
}

/** One insert_rows item: string[], `{ banner }`, or model aliases `{ isBanner, cells }` / `{ cells }`. */
function asInsertTableRow(item: unknown): InsertTableRow | undefined {
  if (isRecord(item) && typeof item.banner === "string" && item.banner.trim()) {
    return { banner: item.banner };
  }
  if (isRecord(item) && (item.isBanner === true || item.banner === true)) {
    const fromCells = cellsFromInsertRowObject(item);
    const banner = firstNonEmptyString(
      item.label,
      item.text,
      item.title,
      fromCells && fromCells.length > 0 ? fromCells.join(" ") : undefined
    );
    if (banner) return { banner };
  }
  if (isRecord(item)) {
    const fromCells = cellsFromInsertRowObject(item);
    if (fromCells && fromCells.length > 0) return fromCells;
  }
  const cells = coerceMatrixRow(item);
  if (!cells || cells.length === 0) return undefined;
  return cells;
}

function asInsertTableRows(value: unknown): InsertTableRow[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const rows: InsertTableRow[] = [];
  for (const item of value) {
    const row = asInsertTableRow(item);
    if (!row) return undefined;
    rows.push(row);
  }
  return rows;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") return value;
  }
  return undefined;
}

function coerceEditCellsShape(next: Record<string, unknown>): void {
  if (!Array.isArray(next.cells) && isRecord(next.cells)) {
    next.cells = [next.cells];
  }
  if (!Array.isArray(next.cells)) {
    const row = asInt(next.row);
    const col = asInt(next.col);
    const insertText = firstString(next.insertText, next.value, next.text, next.content);
    if (row !== null && col !== null && insertText !== undefined) {
      next.cells = [
        {
          row,
          col,
          expectedText: next.expectedText,
          insertText,
        },
      ];
    }
  }
  if (!Array.isArray(next.cells)) return;
  next.cells = next.cells.map((item) => {
    if (!isRecord(item)) return item;
    const insertText = firstString(
      item.insertText,
      item.value,
      item.text,
      item.content
    );
    const expectedText =
      typeof item.expectedText === "string"
        ? item.expectedText
        : typeof item.expected === "string"
          ? item.expected
          : undefined;
    return {
      ...item,
      ...(insertText !== undefined ? { insertText } : {}),
      ...(expectedText !== undefined ? { expectedText } : {}),
    };
  });
}

function headerFromHeadersAlias(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (!Array.isArray(value)) return undefined;
  const names = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
  if (names.length === 0) return undefined;
  return names[names.length - 1];
}

function coerceInsertColumnShape(next: Record<string, unknown>): void {
  if (typeof next.header !== "string" || !next.header.trim()) {
    const header = firstString(
      next.columnHeader,
      next.name,
      next.title,
      headerFromHeadersAlias(next.headers)
    );
    if (header) next.header = header;
  }
}

function looksLikeCellEdits(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (item) =>
      isRecord(item) &&
      asInt(item.row) !== null &&
      asInt(item.col) !== null &&
      firstString(item.insertText, item.value, item.text, item.content) !==
        undefined
  );
}

function coerceInsertRowsShape(next: Record<string, unknown>): void {
  if (Array.isArray(next.rows) && next.rows.length > 0) return;
  const nestedRows = nestedInsertRowsAlias(next);
  if (nestedRows) {
    next.rows = nestedRows;
    return;
  }
  if (Array.isArray(next.cells) && next.cells.length > 0 && !looksLikeCellEdits(next.cells)) {
    next.rows = next.cells;
  }
}

/**
 * Repair common model mistakes so `edit_table` can return a hint (or succeed)
 * instead of throwing at the tool schema. Does not invent cell text.
 */
export function coerceTableOperationInput(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = hoistNestedTableKind({ ...raw });
  const mapped =
    resolveTableKind(next.kind) ?? resolveTableKind(next.operation);
  if (mapped) next.kind = mapped;

  if (next.kind === "edit_cells") coerceEditCellsShape(next);
  if (next.kind === "insert_column") coerceInsertColumnShape(next);
  if (next.kind === "insert_rows") coerceInsertRowsShape(next);

  if (next.kind !== "delete_rows") return next;

  if (
    Array.isArray(next.rows) &&
    next.rows.length > 0 &&
    next.rows.every((item) => typeof item === "number" && Number.isInteger(item))
  ) {
    next.rows = next.rows.map((row) => ({ row }));
  }

  const hasRowObjects =
    Array.isArray(next.rows) &&
    next.rows.length > 0 &&
    next.rows.every((item) => isRecord(item) && asInt(item.row) !== null);

  if (!hasRowObjects) {
    const to = asInt(next.toRow);
    const from = asInt(next.fromRow) ?? (to !== null ? 1 : null);
    if (from !== null && to !== null && to >= from) {
      const rows: Array<{ row: number }> = [];
      for (let row = from; row <= to; row += 1) {
        if (row === 0) continue;
        rows.push({ row });
      }
      if (rows.length > 0) next.rows = rows;
    }
  }
  return next;
}

const TABLE_EDIT_RECOVERY =
  "Call read_section, copy tableIndex and [row,col] from tables[] / structuredText, then retry edit_table with kind at the top of operation. Do not recover with propose_edit (that turns the table into bullets) or draft_field.";

/** Validate an untrusted table operation from persisted / model JSON. */
export function parseTableOperation(raw: unknown): TableOperation | undefined {
  const coerced = coerceTableOperationInput(raw);
  if (!isRecord(coerced) || typeof coerced.kind !== "string") return undefined;
  const tableIndex = asInt(coerced.tableIndex) ?? 0;
  if (tableIndex < 0) return undefined;

  switch (coerced.kind) {
    case "edit_cells": {
      if (!Array.isArray(coerced.cells) || coerced.cells.length === 0) return undefined;
      const cells: TableCellEdit[] = [];
      for (const item of coerced.cells) {
        if (!isRecord(item)) return undefined;
        const row = asInt(item.row);
        const col = asInt(item.col);
        if (row === null || col === null || row < 0 || col < 0) return undefined;
        if (typeof item.insertText !== "string") return undefined;
        cells.push({
          row,
          col,
          expectedText:
            typeof item.expectedText === "string" ? item.expectedText : undefined,
          insertText: item.insertText,
          rowContext:
            typeof item.rowContext === "string" ? item.rowContext : undefined,
        });
      }
      return { kind: "edit_cells", tableIndex, cells };
    }
    case "insert_rows": {
      const afterRow =
        coerced.afterRow === undefined || coerced.afterRow === null
          ? undefined
          : asInt(coerced.afterRow);
      const afterRowKey =
        typeof coerced.afterRowKey === "string" && coerced.afterRowKey.trim()
          ? coerced.afterRowKey
          : undefined;
      const rowsFromField = asInsertTableRows(coerced.rows);
      const bannerOnly =
        typeof coerced.banner === "string" && coerced.banner.trim()
          ? [{ banner: coerced.banner }]
          : undefined;
      const rows = rowsFromField ?? bannerOnly;
      if (afterRow === null || (afterRow !== undefined && afterRow < 0) || !rows) {
        return undefined;
      }
      const expectedRowAtAfter = coerced.expectedRowAtAfter
        ? asStringArray(coerced.expectedRowAtAfter)
        : undefined;
      if (coerced.expectedRowAtAfter && !expectedRowAtAfter) return undefined;
      return {
        kind: "insert_rows",
        tableIndex,
        afterRow,
        ...(afterRowKey ? { afterRowKey } : {}),
        rows,
        expectedRowAtAfter,
      };
    }
    case "delete_rows": {
      if (!Array.isArray(coerced.rows) || coerced.rows.length === 0) return undefined;
      const rows: TableRowDelete[] = [];
      for (const item of coerced.rows) {
        if (!isRecord(item)) return undefined;
        const row = asInt(item.row);
        const expectedCells = asStringArray(item.expectedCells) ?? [];
        if (row === null || row < 0) return undefined;
        rows.push({ row, expectedCells });
      }
      return { kind: "delete_rows", tableIndex, rows };
    }
    case "delete_table":
      return { kind: "delete_table", tableIndex };
    case "insert_column": {
      const afterCol =
        coerced.afterCol === undefined || coerced.afterCol === null
          ? undefined
          : asInt(coerced.afterCol);
      if (afterCol === null || (afterCol !== undefined && afterCol < -1)) {
        return undefined;
      }
      if (typeof coerced.header !== "string" || !coerced.header.trim()) return undefined;
      const values = coerced.values === undefined ? undefined : asStringArray(coerced.values);
      if (coerced.values !== undefined && !values) return undefined;
      const expectedHeaders = coerced.expectedHeaders
        ? asStringArray(coerced.expectedHeaders)
        : undefined;
      if (coerced.expectedHeaders && !expectedHeaders) return undefined;
      if (
        coerced.expectedHeaderAtAfterCol !== undefined &&
        typeof coerced.expectedHeaderAtAfterCol !== "string"
      ) {
        return undefined;
      }
      return {
        kind: "insert_column",
        tableIndex,
        afterCol,
        header: coerced.header,
        values,
        expectedHeaderAtAfterCol:
          typeof coerced.expectedHeaderAtAfterCol === "string"
            ? coerced.expectedHeaderAtAfterCol
            : undefined,
        expectedHeaders,
      };
    }
    case "delete_column": {
      const col = asInt(coerced.col);
      if (col === null || col < 0) return undefined;
      if (typeof coerced.expectedHeaderText !== "string") return undefined;
      const expectedHeaders = coerced.expectedHeaders
        ? asStringArray(coerced.expectedHeaders)
        : undefined;
      if (coerced.expectedHeaders && !expectedHeaders) return undefined;
      return {
        kind: "delete_column",
        tableIndex,
        col,
        expectedHeaderText: coerced.expectedHeaderText,
        expectedHeaders,
      };
    }
    case "create_table": {
      const headers = asStringArray(coerced.headers);
      if (!headers || headers.length === 0) return undefined;
      let rows: string[][] | undefined;
      if (coerced.rows !== undefined) {
        if (Array.isArray(coerced.rows) && coerced.rows.length === 0) {
          rows = [];
        } else {
          const matrix = asStringMatrix(coerced.rows, headers);
          if (!matrix) return undefined;
          rows = matrix;
        }
      }
      const afterAnchor =
        typeof coerced.afterAnchor === "string" && coerced.afterAnchor.trim()
          ? coerced.afterAnchor.trim()
          : undefined;
      const title =
        typeof coerced.title === "string" && coerced.title.trim()
          ? coerced.title.trim()
          : undefined;
      return { kind: "create_table", headers, rows, afterAnchor, title };
    }
    default:
      return undefined;
  }
}

export function tableOperationInvalidHint(raw: unknown): string {
  const coerced = coerceTableOperationInput(raw);
  const kind =
    isRecord(coerced) && typeof coerced.kind === "string" ? coerced.kind : undefined;
  if (kind === "delete_rows") {
    return `delete_rows needs rows: [{ row: N }] with N >= 1 (row 0 is the header and cannot be deleted). To remove the whole table, use kind delete_table with tableIndex from read_section. ${TABLE_EDIT_RECOVERY}`;
  }
  if (kind === "delete_table") {
    return `delete_table needs tableIndex from read_section (0 for the first table). ${TABLE_EDIT_RECOVERY}`;
  }
  if (kind === "create_table") {
    return `create_table needs kind: "create_table" with headers (and optional rows, title, afterAnchor) at the top of operation — not nested as { create_table: { headers, rows } }. ${TABLE_EDIT_RECOVERY}`;
  }
  if (kind === "edit_cells") {
    return `edit_cells needs kind: "edit_cells" with cells: [{ row, col, insertText }]. You may omit expectedText (the server captures the current cell). ${TABLE_EDIT_RECOVERY}`;
  }
  if (kind === "insert_column") {
    return `insert_column needs kind: "insert_column" with header (and optional afterCol, values). Omit afterCol to append as the last column. ${TABLE_EDIT_RECOVERY}`;
  }
  if (kind === "insert_rows") {
    return `insert_rows needs kind: "insert_rows" with rows: [["col1","col2"], ...] or { banner: "GROUP LABEL" }. Do not pass cells or nest insert_rows: [...]. Prefer afterRowKey (first-cell text) over afterRow. ${TABLE_EDIT_RECOVERY}`;
  }
  return `The table operation is malformed. Use one of edit_cells, insert_rows, delete_rows, delete_table, insert_column, delete_column, or create_table. Put kind at the top of operation (kind: edit_cells, tableIndex, cells) — not nested as { edit_cells: { cells } }. ${TABLE_EDIT_RECOVERY}`;
}

export function tableOperationHint(
  status: Exclude<TableOperationStatus, "ok">
): string {
  switch (status) {
    case "no_table":
      return "This field has no table. Use edit_table with kind create_table (headers plus rows) to add one, or read_section and target a field that already contains a table.";
    case "bad_scope":
      return "The table/row/column coordinate does not exist. Call read_section and use the labeled tableIndex and [row,col] tags.";
    case "stale":
      return "The table changed since you read it. Call read_section again and retry edit_table with the current cell text.";
    case "fixed_schema":
      return "This matrix has a fixed column schema. Edit cells or add/delete rows — do not add, delete, or rename columns, and do not remove the table.";
    case "invalid":
      return "The table operation is malformed. Use one of edit_cells, insert_rows, delete_rows, delete_table, insert_column, delete_column, or create_table with kind at the top of operation. Call read_section and copy tableIndex plus [row,col] from tables[] / structuredText. Do not recover with propose_edit or draft_field.";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function summarizeTableOperation(operation: TableOperation): string {
  switch (operation.kind) {
    case "edit_cells": {
      const n = operation.cells.length;
      return n === 1
        ? `Update 1 table cell`
        : `Update ${n} table cells`;
    }
    case "insert_rows": {
      const n = operation.rows.length;
      const where = operation.afterRowKey
        ? `"${operation.afterRowKey}"`
        : `row ${operation.afterRow ?? "last"}`;
      return n === 1
        ? `Insert 1 row after ${where}`
        : `Insert ${n} rows after ${where}`;
    }
    case "delete_rows": {
      const n = operation.rows.length;
      return n === 1 ? "Delete 1 table row" : `Delete ${n} table rows`;
    }
    case "delete_table":
      return "Delete table";
    case "insert_column": {
      const filled = (operation.values ?? []).filter((v) =>
        normalizeTableCellText(v)
      ).length;
      return filled > 0
        ? `Add “${operation.header}” column; populate ${filled} row${filled === 1 ? "" : "s"}`
        : `Add “${operation.header}” column`;
    }
    case "delete_column":
      return `Delete “${operation.expectedHeaderText}” column`;
    case "create_table": {
      const n = (operation.rows ?? []).length;
      const cols = operation.headers.length;
      const titled = operation.title?.trim()
        ? ` “${operation.title.trim()}”`
        : "";
      return n === 0
        ? `Create a ${cols}-column table${titled}`
        : `Create a ${cols}-column table${titled} with ${n} row${n === 1 ? "" : "s"}`;
    }
    default: {
      const _exhaustive: never = operation;
      return _exhaustive;
    }
  }
}

export function tableOperationDetailLines(operation: TableOperation): string[] {
  switch (operation.kind) {
    case "edit_cells":
      return operation.cells.map((cell) => {
        const from = normalizeTableCellText(cell.expectedText ?? "") || EMPTY_CELL_LABEL;
        const to =
          normalizeTableCellText(normalizeSuggestionInsertText(cell.insertText)) ||
          EMPTY_CELL_LABEL;
        return `[${cell.row},${cell.col}] ${from} → ${to}`;
      });
    case "insert_rows":
      return operation.rows.map((row, i) =>
        isBannerInsertRow(row)
          ? `New banner ${i + 1}: ${row.banner || EMPTY_CELL_LABEL}`
          : `New row ${i + 1}: ${row.map((c) => c || EMPTY_CELL_LABEL).join(" | ")}`
      );
    case "delete_rows":
      return operation.rows.map(
        (row) =>
          `Row ${row.row}: ${row.expectedCells.map((c) => c || EMPTY_CELL_LABEL).join(" | ")}`
      );
    case "delete_table":
      return [`Table ${operation.tableIndex}`];
    case "insert_column":
      return [
        `Header: ${operation.header}`,
        ...(operation.values ?? [])
          .map((value, i) =>
            normalizeTableCellText(value)
              ? `Row ${i + 1}: ${normalizeSuggestionInsertText(value)}`
              : ""
          )
          .filter(Boolean),
      ];
    case "delete_column":
      return [`Column ${operation.col}: ${operation.expectedHeaderText}`];
    case "create_table":
      return [
        ...(operation.title?.trim()
          ? [`Title: ${operation.title.trim()}`]
          : []),
        `Headers: ${operation.headers.map((h) => h || EMPTY_CELL_LABEL).join(" | ")}`,
        ...(operation.rows ?? []).map(
          (row, i) =>
            `Row ${i + 1}: ${row.map((c) => c || EMPTY_CELL_LABEL).join(" | ")}`
        ),
      ];
    default: {
      const _exhaustive: never = operation;
      return [_exhaustive];
    }
  }
}
