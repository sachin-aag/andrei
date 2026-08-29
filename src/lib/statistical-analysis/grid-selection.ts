export type GridSelection = {
  col: number;
  row: number;
  anchorCol: number;
  anchorRow: number;
  /** Whole-row highlight; focus stays on `col` for Analyze. */
  axis?: "row";
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

/** Move column focus without clearing a multi-row selection span. */
export function focusColumn(selection: GridSelection, col: number): GridSelection {
  if (selection.axis === "row") {
    return { ...selection, col, anchorCol: col };
  }
  const rowStart = Math.min(selection.row, selection.anchorRow);
  const rowEnd = Math.max(selection.row, selection.anchorRow);
  if (rowStart === rowEnd) {
    return collapseSelection(col, selection.row);
  }
  return {
    col,
    row: selection.row,
    anchorCol: col,
    anchorRow: selection.anchorRow,
  };
}

export function isRowSelection(selection: GridSelection): boolean {
  return selection.axis === "row";
}

export function selectRows(
  row: number,
  anchorRow: number,
  focusCol: number
): GridSelection {
  return {
    col: focusCol,
    row,
    anchorCol: focusCol,
    anchorRow,
    axis: "row",
  };
}

export function selectionBounds(
  selection: GridSelection,
  maxCol = 0
): GridSelectionBounds {
  const rowStart = Math.min(selection.row, selection.anchorRow);
  const rowEnd = Math.max(selection.row, selection.anchorRow);
  if (selection.axis === "row") {
    return {
      colStart: 0,
      colEnd: Math.max(0, maxCol),
      rowStart,
      rowEnd,
    };
  }
  return {
    colStart: Math.min(selection.col, selection.anchorCol),
    colEnd: Math.max(selection.col, selection.anchorCol),
    rowStart,
    rowEnd,
  };
}

export function isCellInSelection(
  selection: GridSelection,
  col: number,
  row: number
): boolean {
  const bounds = selectionBounds(selection);
  if (selection.axis === "row") {
    return row >= bounds.rowStart && row <= bounds.rowEnd;
  }
  return (
    col >= bounds.colStart &&
    col <= bounds.colEnd &&
    row >= bounds.rowStart &&
    row <= bounds.rowEnd
  );
}

export function rowIsInSelection(
  selection: GridSelection,
  row: number
): boolean {
  const bounds = selectionBounds(selection);
  return row >= bounds.rowStart && row <= bounds.rowEnd;
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
    ...(selection.axis === "row" ? { axis: "row" as const } : {}),
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
  const keepRowAxis = extend && selection.axis === "row" && dCol === 0;
  const next = clampSelection(
    {
      col: selection.col + dCol,
      row: selection.row + dRow,
      anchorCol: extend ? selection.anchorCol : selection.col + dCol,
      anchorRow: extend ? selection.anchorRow : selection.row + dRow,
      ...(keepRowAxis ? { axis: "row" as const } : {}),
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
