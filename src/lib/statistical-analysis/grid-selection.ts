export type GridSelection = {
  col: number;
  row: number;
  anchorCol: number;
  anchorRow: number;
};

export type GridSelectionBounds = {
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
};

export function collapseSelection(col: number, row: number): GridSelection {
  return { col, row, anchorCol: col, anchorRow: row };
}

export function selectionBounds(selection: GridSelection): GridSelectionBounds {
  return {
    colStart: Math.min(selection.col, selection.anchorCol),
    colEnd: Math.max(selection.col, selection.anchorCol),
    rowStart: Math.min(selection.row, selection.anchorRow),
    rowEnd: Math.max(selection.row, selection.anchorRow),
  };
}

export function isCellInSelection(
  selection: GridSelection,
  col: number,
  row: number
): boolean {
  const bounds = selectionBounds(selection);
  return (
    col >= bounds.colStart &&
    col <= bounds.colEnd &&
    row >= bounds.rowStart &&
    row <= bounds.rowEnd
  );
}

export function clampSelection(
  selection: GridSelection,
  maxCol: number,
  maxRow: number
): GridSelection {
  const clampCol = (value: number) =>
    Math.max(0, Math.min(value, Math.max(0, maxCol)));
  const clampRow = (value: number) =>
    Math.max(0, Math.min(value, Math.max(0, maxRow)));
  return {
    col: clampCol(selection.col),
    row: clampRow(selection.row),
    anchorCol: clampCol(selection.anchorCol),
    anchorRow: clampRow(selection.anchorRow),
  };
}

export function moveSelection(
  selection: GridSelection,
  dCol: number,
  dRow: number,
  extend: boolean,
  maxCol: number,
  maxRow: number
): GridSelection {
  const next = clampSelection(
    {
      col: selection.col + dCol,
      row: selection.row + dRow,
      anchorCol: extend ? selection.anchorCol : selection.col + dCol,
      anchorRow: extend ? selection.anchorRow : selection.row + dRow,
    },
    maxCol,
    maxRow
  );
  return next;
}

/**
 * 1-based inclusive row span when the engineer selected more than one row.
 * A single cell (or a single row) means “use the whole column”.
 */
export function rowRangeFromGridSelection(
  selection: GridSelection
): { start: number; end: number } | null {
  const bounds = selectionBounds(selection);
  if (bounds.rowStart === bounds.rowEnd) return null;
  return { start: bounds.rowStart + 1, end: bounds.rowEnd + 1 };
}
