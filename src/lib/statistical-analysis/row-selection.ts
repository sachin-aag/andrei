import { MAX_WORKSHEET_ROWS } from "./types";

/** 1-based worksheet rows. `all` uses every filled cell in the column. */
export type AnalysisRowSelection =
  | { mode: "all" }
  | { mode: "range"; start: number; end: number }
  | { mode: "from"; start: number }
  | { mode: "rows"; rows: number[] };

export type RowSelectionInput = {
  rowStart?: number | null;
  rowEnd?: number | null;
  rows?: readonly number[] | null;
};

function clampRow(value: number): number {
  return Math.max(1, Math.min(MAX_WORKSHEET_ROWS, Math.trunc(value)));
}

function uniqueSortedRows(values: readonly number[]): number[] {
  const used = new Set<number>();
  const rows: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const row = clampRow(value);
    if (used.has(row)) continue;
    used.add(row);
    rows.push(row);
  }
  return rows.toSorted((a, b) => a - b);
}

function asContiguousRange(rows: readonly number[]): AnalysisRowSelection {
  if (rows.length === 0) return { mode: "all" };
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const contiguous = last - first + 1 === rows.length;
  if (contiguous) return { mode: "range", start: first, end: last };
  return { mode: "rows", rows: [...rows] };
}

export function normalizeRowSelection(
  input: RowSelectionInput
): AnalysisRowSelection {
  if (input.rows != null && input.rows.length > 0) {
    return asContiguousRange(uniqueSortedRows(input.rows));
  }
  if (input.rowStart == null && input.rowEnd == null) {
    return { mode: "all" };
  }
  if (input.rowStart != null && input.rowEnd == null) {
    return { mode: "from", start: clampRow(input.rowStart) };
  }
  const start = clampRow(input.rowStart ?? 1);
  const end = clampRow(input.rowEnd ?? start);
  return {
    mode: "range",
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

export function configRowFields(selection: AnalysisRowSelection): {
  rowStart: number | null;
  rowEnd: number | null;
  rows: number[] | null;
} {
  switch (selection.mode) {
    case "all":
      return { rowStart: null, rowEnd: null, rows: null };
    case "range":
      return { rowStart: selection.start, rowEnd: selection.end, rows: null };
    case "from":
      return { rowStart: selection.start, rowEnd: null, rows: null };
    case "rows":
      return { rowStart: null, rowEnd: null, rows: selection.rows };
    default: {
      const exhaustive: never = selection;
      return exhaustive;
    }
  }
}

export function formatRowSelection(selection: AnalysisRowSelection): string {
  switch (selection.mode) {
    case "all":
      return "";
    case "range":
      return selection.start === selection.end
        ? `rows ${selection.start}`
        : `rows ${selection.start}–${selection.end}`;
    case "from":
      return `from row ${selection.start}`;
    case "rows": {
      if (selection.rows.length <= 8) {
        return `rows ${selection.rows.join(", ")}`;
      }
      return `${selection.rows.length} rows`;
    }
    default: {
      const exhaustive: never = selection;
      return exhaustive;
    }
  }
}
