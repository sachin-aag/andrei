import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import { dvTableHeadersForSection } from "@/lib/document-types/design-verification/sections";
import { inlineMarkdownToTextNodesWithBreaks } from "@/lib/tiptap/markdown-to-doc";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { flattenForAnchor, topLevelIndexAfterAnchor } from "@/lib/suggestions/locator";
import {
  insertNodesAfterTopLevelIndex,
  insertNodesIntoFieldBody,
} from "@/lib/suggestions/block-insert";
import { normalizeTrailingCitationBlockInDoc } from "@/lib/suggestions/citations-at-end";

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
      /** Omit to append after the last existing row. */
      afterRow?: number;
      rows: string[][];
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
      afterCol: number;
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
    };

export type TableCellEdit = {
  row: number;
  col: number;
  expectedText: string;
  insertText: string;
};

export type TableRowDelete = {
  row: number;
  expectedCells: string[];
};

export type TableOperationContext = {
  section: SectionType;
  targetField: string;
};

export type TableOperationStatus =
  | "ok"
  | "no_table"
  | "bad_scope"
  | "stale"
  | "fixed_schema"
  | "invalid";

export type TableOperationResult =
  | { ok: true; status: "ok"; doc: JSONContent }
  | { ok: false; status: Exclude<TableOperationStatus, "ok">; hint: string };

const EMPTY_CELL_LABEL = "(empty)";

const DEFAULT_CELL_ATTRS = {
  colspan: 1,
  rowspan: 1,
  colwidth: null,
} as const;

/** True when this field is a seeded DV matrix with a locked column schema. */
export function isFixedColumnTable(
  section: string,
  targetField: string
): boolean {
  return targetField === "table" && dvTableHeadersForSection(section).length > 0;
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

function rowSnapshot(row: JSONContent): string[] {
  return rowCells(row).map(cellPlainText);
}

function headersOf(table: JSONContent): string[] {
  const rows = tableRows(table);
  const header = rows[0];
  return header ? rowSnapshot(header) : [];
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
      return captured;
    case "insert_rows": {
      if (captured.afterRow === undefined) {
        captured.afterRow = Math.max(0, rows.length - 1);
      }
      if (captured.expectedRowAtAfter === undefined) {
        const anchor = rows[captured.afterRow];
        if (anchor) captured.expectedRowAtAfter = rowSnapshot(anchor);
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
    insertNodesAfterTopLevelIndex(doc, located.index, [table]);
    return { ok: true, status: "ok", doc };
  }
  insertNodesIntoFieldBody(doc, [table]);
  return { ok: true, status: "ok", doc };
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
      return applyEditCells(next, table, operation, fixedColumns);
    case "insert_rows":
      return applyInsertRows(next, table, operation);
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
      return applyInsertColumn(next, table, operation);
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
        `Row ${cell.row} does not exist. Re-read with read_section.`
      );
    }
    const cells = rowCells(row);
    const node = cells[cell.col];
    if (!node) {
      return fail(
        "bad_scope",
        `Cell [${cell.row},${cell.col}] does not exist. Re-read with read_section.`
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
    const expected = normalizeTableCellText(cell.expectedText);
    if (cellPlainText(node) !== expected) {
      return fail(
        "stale",
        `Cell [${cell.row},${cell.col}] no longer matches expectedText. Re-read with read_section.`
      );
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
  const afterRow = operation.afterRow ?? Math.max(0, rows.length - 1);
  if (afterRow < 0 || afterRow >= rows.length) {
    return fail(
      "bad_scope",
      `afterRow ${afterRow} does not exist. Re-read with read_section.`
    );
  }
  const anchor = rows[afterRow]!;
  if (!cellsMatch(rowSnapshot(anchor), operation.expectedRowAtAfter)) {
    return fail(
      "stale",
      `Row ${operation.afterRow} no longer matches the expected snapshot. Re-read with read_section.`
    );
  }
  const colCount = rowCells(anchor).length;
  if (colCount === 0) {
    return fail("invalid", "Cannot insert into a table with no columns.");
  }
  for (const [i, row] of operation.rows.entries()) {
    if (row.length !== colCount) {
      return fail(
        "invalid",
        `Inserted row ${i} has ${row.length} cell(s); the table has ${colCount} column(s).`
      );
    }
  }
  const newRows = operation.rows.map((cells) => ({
    type: "tableRow" as const,
    content: cells.map((text, col) =>
      makeCell("tableCell", text, templateAttrs(rowCells(anchor), col))
    ),
  }));
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
  location.parent.content = location.parent.content.filter(
    (_, index) => index !== location.index
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
  const afterCol = operation.afterCol;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return undefined;
  }
  return value as string[];
}

function asStringMatrix(value: unknown): string[][] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows: string[][] = [];
  for (const row of value) {
    const cells = asStringArray(row);
    if (!cells || cells.length === 0) return null;
    rows.push(cells);
  }
  return rows;
}

/**
 * Repair common model mistakes so `edit_table` can return a hint (or succeed)
 * instead of throwing at the tool schema. Does not invent cell text.
 */
export function coerceTableOperationInput(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw };
  if (typeof next.kind !== "string" && typeof next.operation === "string") {
    next.kind = next.operation;
  }
  if (next.kind === "remove_table" || next.kind === "drop_table") {
    next.kind = "delete_table";
  }
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
        if (typeof item.expectedText !== "string" || typeof item.insertText !== "string") {
          return undefined;
        }
        cells.push({
          row,
          col,
          expectedText: item.expectedText,
          insertText: item.insertText,
        });
      }
      return { kind: "edit_cells", tableIndex, cells };
    }
    case "insert_rows": {
      const afterRow =
        coerced.afterRow === undefined || coerced.afterRow === null
          ? undefined
          : asInt(coerced.afterRow);
      const rows = asStringMatrix(coerced.rows);
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
      const afterCol = asInt(coerced.afterCol);
      if (afterCol === null || afterCol < -1) return undefined;
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
          const matrix = asStringMatrix(coerced.rows);
          if (!matrix) return undefined;
          rows = matrix;
        }
      }
      const afterAnchor =
        typeof coerced.afterAnchor === "string" && coerced.afterAnchor.trim()
          ? coerced.afterAnchor.trim()
          : undefined;
      return { kind: "create_table", headers, rows, afterAnchor };
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
    return "delete_rows needs rows: [{ row: N }] with N >= 1 (row 0 is the header and cannot be deleted). To remove the whole table, use kind delete_table with tableIndex from read_section. Do not rewrite the field with draft_field.";
  }
  if (kind === "delete_table") {
    return "delete_table needs tableIndex from read_section (0 for the first table). Do not rewrite the field with draft_field.";
  }
  return "The table operation is malformed. Use one of edit_cells, insert_rows, delete_rows, delete_table, insert_column, delete_column, or create_table. To remove a whole table, use kind delete_table with tableIndex. Do not rewrite the field with draft_field.";
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
      return "The table operation is malformed. Use one of edit_cells, insert_rows, delete_rows, delete_table, insert_column, delete_column, or create_table with the fields listed in the tool schema. To remove a whole table, use kind delete_table. Do not rewrite the field with draft_field.";
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
      return n === 1
        ? `Insert 1 row after row ${operation.afterRow ?? "last"}`
        : `Insert ${n} rows after row ${operation.afterRow ?? "last"}`;
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
      return n === 0
        ? `Create a ${cols}-column table`
        : `Create a ${cols}-column table with ${n} row${n === 1 ? "" : "s"}`;
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
        const from = normalizeTableCellText(cell.expectedText) || EMPTY_CELL_LABEL;
        const to =
          normalizeTableCellText(normalizeSuggestionInsertText(cell.insertText)) ||
          EMPTY_CELL_LABEL;
        return `[${cell.row},${cell.col}] ${from} → ${to}`;
      });
    case "insert_rows":
      return operation.rows.map(
        (row, i) => `New row ${i + 1}: ${row.map((c) => c || EMPTY_CELL_LABEL).join(" | ")}`
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
