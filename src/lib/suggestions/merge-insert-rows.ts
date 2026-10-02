import {
  normalizeTableCellText,
  type TableOperation,
} from "@/lib/suggestions/table-operation";

export type InsertRowsOperation = Extract<TableOperation, { kind: "insert_rows" }>;

export function isInsertRowsOperation(
  operation: TableOperation | undefined
): operation is InsertRowsOperation {
  return operation?.kind === "insert_rows";
}

export function insertRowFirstCellKey(row: readonly string[]): string {
  return normalizeTableCellText(row[0] ?? "").toLowerCase();
}

/**
 * Incoming insert point sits inside the pending insert_rows block
 * (inclusive of the last pending row). Overlay-captured `afterRow` is
 * required — an unresolved afterRowKey is not foldable.
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
  return incoming.afterRow >= blockStart && incoming.afterRow <= blockEnd;
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
 */
export function mergeInsertRowsOperations(
  existing: InsertRowsOperation,
  incoming: InsertRowsOperation
): InsertRowsOperation {
  const existingAfter = existing.afterRow ?? 0;
  const incomingAfter = incoming.afterRow ?? existingAfter;
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
