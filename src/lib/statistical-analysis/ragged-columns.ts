/**
 * Columns written together in one table dump are rows of the same table, so
 * they are the same height. When one comes back a fraction of the others, the
 * batch was mis-assembled — two tables merged onto one sheet, or the model ran
 * out of transcript partway and wrote what it had.
 *
 * That failure is silent without this check: the multi-column write reports
 * the FIRST column's row count, so a dump where TT1 got 2,142 rows and DATE
 * got 2 reads as a clean 2,142-row write. The engineer finds it later by
 * scrolling, and a time series built on it silently loses its timestamps.
 */

/** Below this the batch is too small for a ratio to mean anything. */
const MIN_ROWS_TO_JUDGE = 10;

/**
 * A column shorter than this share of the tallest is ragged. Deliberately
 * loose: a few trailing blanks in a notes or label column are normal, and a
 * false refusal costs more than a missed near-miss.
 */
const RAGGED_SHARE = 0.5;

export type WrittenColumnHeight = {
  columnName: string | null;
  rowsWritten: number;
};

export type RaggedColumn = {
  columnName: string;
  rowsWritten: number;
  expectedRows: number;
};

/**
 * Columns that came back far shorter than the tallest in the same write.
 *
 * Empty columns are not ragged — a column written with no values at all is a
 * different intent (clearing it, or a placeholder), not a truncated dump.
 */
export function raggedColumns(
  columns: readonly WrittenColumnHeight[]
): RaggedColumn[] {
  if (columns.length < 2) return [];
  const tallest = columns.reduce(
    (max, column) => Math.max(max, column.rowsWritten),
    0
  );
  if (tallest < MIN_ROWS_TO_JUDGE) return [];

  const ragged: RaggedColumn[] = [];
  for (const column of columns) {
    if (column.rowsWritten === 0) continue;
    if (column.rowsWritten >= tallest * RAGGED_SHARE) continue;
    ragged.push({
      columnName: column.columnName ?? "(unnamed)",
      rowsWritten: column.rowsWritten,
      expectedRows: tallest,
    });
  }
  return ragged;
}

export function raggedColumnsNote(ragged: readonly RaggedColumn[]): string {
  const detail = ragged
    .map(
      (column) =>
        `${column.columnName} got ${column.rowsWritten} of ${column.expectedRows}`
    )
    .join("; ");
  return (
    `INCOMPLETE: ${detail}. Columns of one table are the same height, so this dump is missing rows — ` +
    "re-read the pages for those columns and write the sheet again before reporting the extract done. " +
    "Do not run an analysis on it and do not tell the engineer the table is filled."
  );
}
