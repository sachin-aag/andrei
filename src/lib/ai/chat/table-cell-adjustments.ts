import type { TableOperation } from "@/lib/suggestions/table-operation";

export type TableCellAdjustment = {
  rowKey?: string;
  row: number;
  col: number;
  column?: string;
  requested: string;
  saved: string;
};

const MAX_ADJUSTMENTS = 24;

function normalized(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Server-attached `[file, p. N]` / `[n]` brackets are not a content change. */
function withoutCitations(text: string | undefined): string {
  return normalized((text ?? "").replace(/\[[^\]]*\]/g, " "));
}

function differs(want: string, got: string): boolean {
  return withoutCitations(want) !== withoutCitations(got);
}

function rowKeyOf(row: readonly string[]): string | undefined {
  const first = withoutCitations(row[0]);
  return first || undefined;
}

function rowGridAdjustments(
  requested: readonly string[][],
  saved: readonly string[][],
  columnLabel: (col: number) => string | null
): TableCellAdjustment[] {
  const out: TableCellAdjustment[] = [];
  requested.forEach((row, rowIndex) => {
    const savedRow = saved[rowIndex] ?? [];
    row.forEach((cell, col) => {
      const want = normalized(cell);
      const got = normalized(savedRow[col]);
      if (!want || !differs(want, got)) return;
      out.push({
        rowKey: rowKeyOf(savedRow.length > 0 ? savedRow : row),
        row: rowIndex,
        col,
        column: columnLabel(col) ?? undefined,
        requested: want,
        saved: got,
      });
    });
  });
  return out;
}

/**
 * Cells whose saved text differs from what the model asked for (grounding
 * cleared unsupported Remarks, ranked Stage up to PQ, dropped a leftover
 * placeholder). The tool result lists them so the wrap-up reports what
 * landed instead of echoing the request.
 */
export function tableCellAdjustments(
  requested: TableOperation,
  saved: TableOperation,
  columnLabel: (col: number) => string | null = () => null
): TableCellAdjustment[] {
  let out: TableCellAdjustment[] = [];
  if (requested.kind === "edit_cells" && saved.kind === "edit_cells") {
    const cellKey = (cell: { row: number; col: number; rowKey?: string }) =>
      `${normalized(cell.rowKey) || `#${cell.row}`}:${cell.col}`;
    const savedByKey = new Map(saved.cells.map((cell) => [cellKey(cell), cell]));
    for (const cell of requested.cells) {
      const want = normalized(cell.insertText);
      const got = normalized(savedByKey.get(cellKey(cell))?.insertText);
      if (!want || !differs(want, got)) continue;
      out.push({
        ...(cell.rowKey ? { rowKey: cell.rowKey } : {}),
        row: cell.row,
        col: cell.col,
        column: columnLabel(cell.col) ?? undefined,
        requested: want,
        saved: got,
      });
    }
  } else if (
    (requested.kind === "insert_rows" && saved.kind === "insert_rows") ||
    (requested.kind === "create_table" && saved.kind === "create_table")
  ) {
    out = rowGridAdjustments(
      requested.rows ?? [],
      saved.rows ?? [],
      columnLabel
    );
  }
  return out.slice(0, MAX_ADJUSTMENTS);
}

export function tableCellAdjustmentsMessage(
  adjustments: readonly TableCellAdjustment[]
): string {
  const cleared = adjustments.filter((adj) => !adj.saved).length;
  const changed = adjustments.length - cleared;
  const parts = [
    cleared > 0 ? `${cleared} requested cell(s) were saved empty` : "",
    changed > 0 ? `${changed} were saved with different text` : "",
  ].filter(Boolean);
  return `${parts.join(" and ")} because the retrieved pages did not support the requested value. Report the saved values in adjustedCells, not the requested ones; do not claim an empty cell was filled.`;
}
