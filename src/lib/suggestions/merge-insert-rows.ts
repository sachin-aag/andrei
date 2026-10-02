import type { JSONContent } from "@tiptap/core";
import {
  applyTableOperation,
  normalizeTableCellText,
  summarizeTablesInDoc,
  type TableOperation,
} from "@/lib/suggestions/table-operation";

export type InsertRowsOperation = Extract<TableOperation, { kind: "insert_rows" }>;
export type EditCellsOperation = Extract<TableOperation, { kind: "edit_cells" }>;

export function isInsertRowsOperation(
  operation: TableOperation | undefined
): operation is InsertRowsOperation {
  return operation?.kind === "insert_rows";
}

export function isEditCellsOperation(
  operation: TableOperation | undefined
): operation is EditCellsOperation {
  return operation?.kind === "edit_cells";
}

export function insertRowFirstCellKey(row: readonly string[]): string {
  return normalizeTableCellText(row[0] ?? "").toLowerCase();
}

/**
 * Incoming insert point sits inside the pending insert_rows block
 * (inclusive of the last pending row). Overlay-captured `afterRow` is
 * required — an unresolved afterRowKey is not foldable.
 *
 * Agent often passes afterRow 0 (after the header) on later calls while
 * the first omit-afterRow captured after the seeded blank data row
 * (afterRow 1). That is still the same inventory fill.
 */
export function canFoldInsertRows(
  existing: InsertRowsOperation,
  incoming: InsertRowsOperation
): boolean {
  if (existing.tableIndex !== incoming.tableIndex) return false;
  if (incoming.rows.length === 0) return false;
  if (incoming.afterRow === undefined) return false;
  const blockStart = existing.afterRow ?? 0;
  const blockEnd = blockStart + existing.rows.length;
  if (incoming.afterRow >= blockStart && incoming.afterRow <= blockEnd) {
    return true;
  }
  return incoming.afterRow === 0 && blockStart <= 1;
}

function uniqueIncomingRows(
  existing: InsertRowsOperation,
  incoming: InsertRowsOperation
): string[][] {
  const seen = new Set(
    existing.rows.map(insertRowFirstCellKey).filter(Boolean)
  );
  const added: string[][] = [];
  for (const row of incoming.rows) {
    const key = insertRowFirstCellKey(row);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    added.push(row);
  }
  return added;
}

export function incomingInsertRowsToAdd(
  existing: InsertRowsOperation,
  incoming: InsertRowsOperation
): string[][] {
  return uniqueIncomingRows(existing, incoming);
}

/**
 * Splice incoming rows into the open card. Keep the existing afterRow /
 * afterRowKey / expectedRowAtAfter so Apply still locates against the
 * persisted table (pending rows are not saved yet).
 *
 * Same insert point as the open card appends (extend the batch). An
 * overlay afterRow inside the pending block inserts after that pending row.
 * An afterRow 0 follow-up on a card that captured afterRow 1 appends
 * (do not prepend later documents above the first pending row).
 */
export function mergeInsertRowsOperations(
  existing: InsertRowsOperation,
  incoming: InsertRowsOperation
): InsertRowsOperation {
  const existingAfter = existing.afterRow ?? 0;
  const rawIncomingAfter = incoming.afterRow ?? existingAfter;
  const incomingAfter =
    rawIncomingAfter < existingAfter ? existingAfter : rawIncomingAfter;
  const spliceAt =
    incomingAfter === existingAfter
      ? existing.rows.length
      : Math.max(
          0,
          Math.min(incomingAfter - existingAfter, existing.rows.length)
        );
  const rows = [...existing.rows];
  rows.splice(spliceAt, 0, ...uniqueIncomingRows(existing, incoming));
  return {
    ...existing,
    rows,
  };
}

function uniqueEditCellsRow(operation: EditCellsOperation): number | undefined {
  const rows = [...new Set(operation.cells.map((cell) => cell.row))];
  return rows.length === 1 ? rows[0] : undefined;
}

function liveRowTexts(
  fieldDoc: JSONContent,
  tableIndex: number,
  row: number
): string[] | null {
  const table = summarizeTablesInDoc(fieldDoc)[tableIndex];
  if (!table) return null;
  const texts: string[] = [];
  for (const cell of table.cells) {
    if (cell.row !== row) continue;
    texts[cell.col] = cell.text === "(empty)" ? "" : cell.text;
  }
  if (texts.length === 0) return null;
  return Array.from({ length: table.headers.length }, (_, col) => texts[col] ?? "");
}

function isBlankRowTexts(texts: readonly string[] | null): boolean {
  return Boolean(
    texts && texts.every((cell) => normalizeTableCellText(cell).length === 0)
  );
}

/** edit_cells of one blank seeded data row (not a filled URS / inventory row). */
export function scaffoldEditCellsRow(
  operation: EditCellsOperation,
  fieldDoc: JSONContent
): number | undefined {
  const row = uniqueEditCellsRow(operation);
  if (row === undefined || row < 1) return undefined;
  if (!isBlankRowTexts(liveRowTexts(fieldDoc, operation.tableIndex, row))) {
    return undefined;
  }
  return row;
}

export function filledRowFromEditCells(
  operation: EditCellsOperation,
  fieldDoc: JSONContent
): string[] | null {
  const row = uniqueEditCellsRow(operation);
  if (row === undefined) return null;
  const applied = applyTableOperation(fieldDoc, operation);
  if (!applied.ok) return null;
  return liveRowTexts(applied.doc, operation.tableIndex, row);
}

function insertRowsFromFilledSeed(
  tableIndex: number,
  filled: string[],
  fieldDoc: JSONContent
): InsertRowsOperation {
  const headers = summarizeTablesInDoc(fieldDoc)[tableIndex]?.headers;
  return {
    kind: "insert_rows",
    tableIndex,
    afterRow: 0,
    rows: [filled],
    ...(headers ? { expectedRowAtAfter: headers } : {}),
  };
}

export function canFoldInsertRowsOntoEditCells(
  existing: EditCellsOperation,
  incoming: InsertRowsOperation,
  fieldDoc: JSONContent
): boolean {
  if (existing.tableIndex !== incoming.tableIndex) return false;
  if (incoming.rows.length === 0) return false;
  return scaffoldEditCellsRow(existing, fieldDoc) !== undefined;
}

export function mergeEditCellsWithInsertRows(
  existing: EditCellsOperation,
  incoming: InsertRowsOperation,
  fieldDoc: JSONContent
): InsertRowsOperation | null {
  const filled = filledRowFromEditCells(existing, fieldDoc);
  if (!filled) return null;
  const seed = insertRowsFromFilledSeed(existing.tableIndex, filled, fieldDoc);
  return mergeInsertRowsOperations(seed, {
    ...incoming,
    afterRow: incoming.afterRow === 0 ? 0 : Math.max(incoming.afterRow ?? 1, 1),
  });
}

export function canFoldEditCellsOntoInsertRows(
  existing: InsertRowsOperation,
  incoming: EditCellsOperation,
  fieldDoc: JSONContent
): boolean {
  if (existing.tableIndex !== incoming.tableIndex) return false;
  return scaffoldEditCellsRow(incoming, fieldDoc) !== undefined;
}

export function mergeInsertRowsWithEditCells(
  existing: InsertRowsOperation,
  incoming: EditCellsOperation,
  fieldDoc: JSONContent
): InsertRowsOperation | null {
  const filled = filledRowFromEditCells(incoming, fieldDoc);
  if (!filled) return null;
  const seed = insertRowsFromFilledSeed(existing.tableIndex, filled, fieldDoc);
  return mergeInsertRowsOperations(seed, {
    ...existing,
    afterRow: (existing.afterRow ?? 0) <= 1 ? 1 : existing.afterRow,
  });
}

export type FoldTableRowsResult =
  | { status: "folded"; operation: InsertRowsOperation; added: number }
  | { status: "already_present" }
  | { status: "no_fold" };

/**
 * Fold a later same-table row edit onto the open card. Converts a seeded
 * blank-row `edit_cells` plus later `insert_rows` into one insert_rows
 * (afterRow 0, first row occupies the seed).
 */
export function foldSameTableRowOperations(
  existing: TableOperation,
  incoming: TableOperation,
  fieldDoc: JSONContent
): FoldTableRowsResult {
  if (isInsertRowsOperation(existing) && isInsertRowsOperation(incoming)) {
    if (!canFoldInsertRows(existing, incoming)) return { status: "no_fold" };
    const added = incomingInsertRowsToAdd(existing, incoming);
    if (added.length === 0) return { status: "already_present" };
    return {
      status: "folded",
      operation: mergeInsertRowsOperations(existing, incoming),
      added: added.length,
    };
  }
  if (isEditCellsOperation(existing) && isInsertRowsOperation(incoming)) {
    if (!canFoldInsertRowsOntoEditCells(existing, incoming, fieldDoc)) {
      return { status: "no_fold" };
    }
    const merged = mergeEditCellsWithInsertRows(existing, incoming, fieldDoc);
    if (!merged) return { status: "no_fold" };
    const filled = filledRowFromEditCells(existing, fieldDoc);
    const added = filled
      ? incomingInsertRowsToAdd(
          insertRowsFromFilledSeed(existing.tableIndex, filled, fieldDoc),
          incoming
        )
      : incoming.rows;
    if (added.length === 0) return { status: "already_present" };
    return { status: "folded", operation: merged, added: added.length };
  }
  if (isInsertRowsOperation(existing) && isEditCellsOperation(incoming)) {
    if (!canFoldEditCellsOntoInsertRows(existing, incoming, fieldDoc)) {
      return { status: "no_fold" };
    }
    const filled = filledRowFromEditCells(incoming, fieldDoc);
    if (!filled) return { status: "no_fold" };
    const key = insertRowFirstCellKey(filled);
    if (key && existing.rows.some((row) => insertRowFirstCellKey(row) === key)) {
      return { status: "already_present" };
    }
    const merged = mergeInsertRowsWithEditCells(existing, incoming, fieldDoc);
    if (!merged) return { status: "no_fold" };
    return { status: "folded", operation: merged, added: 1 };
  }
  return { status: "no_fold" };
}

export function isFoldableTableRowOperation(
  operation: TableOperation | undefined,
  fieldDoc: JSONContent
): operation is InsertRowsOperation | EditCellsOperation {
  if (isInsertRowsOperation(operation)) return true;
  if (isEditCellsOperation(operation)) {
    return scaffoldEditCellsRow(operation, fieldDoc) !== undefined;
  }
  return false;
}
