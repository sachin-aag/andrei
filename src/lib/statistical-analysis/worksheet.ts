import {
  MAX_CELL_LENGTH,
  MAX_COLUMN_NAME_LENGTH,
  MAX_WORKSHEET_COLUMNS,
  MAX_WORKSHEET_ROWS,
  MIN_VISIBLE_COLUMNS,
  type WorksheetColumn,
  type WorksheetData,
} from "./types";

export function defaultColumnName(index: number): string {
  return `C${index + 1}`;
}

export function defaultColumnId(index: number): string {
  return `c${index + 1}`;
}

export function createEmptyWorksheet(
  columnCount = MIN_VISIBLE_COLUMNS
): WorksheetData {
  const count = Math.min(
    MAX_WORKSHEET_COLUMNS,
    Math.max(1, Math.floor(columnCount))
  );
  return {
    columns: Array.from({ length: count }, (_, i) => ({
      id: defaultColumnId(i),
      name: defaultColumnName(i),
      values: [],
    })),
  };
}

export function trimTrailingEmpty(values: string[]): string[] {
  let end = values.length;
  while (end > 0 && values[end - 1]!.trim() === "") end -= 1;
  return values.slice(0, end);
}

export function rowCount(data: WorksheetData): number {
  let max = 0;
  for (const column of data.columns) {
    max = Math.max(max, trimTrailingEmpty(column.values).length);
  }
  return max;
}

export function nextColumnId(data: WorksheetData): string {
  let max = data.columns.length;
  for (const column of data.columns) {
    const match = /^c(\d+)$/i.exec(column.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `c${max + 1}`;
}

export function nextColumnName(data: WorksheetData): string {
  const used = new Set(data.columns.map((column) => column.name));
  let index = 0;
  let name = defaultColumnName(index);
  while (used.has(name)) {
    index += 1;
    name = defaultColumnName(index);
  }
  return name;
}

export function sanitizeCell(value: string): string {
  if (value.length <= MAX_CELL_LENGTH) return value;
  return value.slice(0, MAX_CELL_LENGTH);
}

export function sanitizeColumnName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "C1";
  return trimmed.slice(0, MAX_COLUMN_NAME_LENGTH);
}

export function setCell(
  data: WorksheetData,
  colIndex: number,
  rowIndex: number,
  value: string
): WorksheetData {
  if (
    colIndex < 0 ||
    rowIndex < 0 ||
    colIndex >= MAX_WORKSHEET_COLUMNS ||
    rowIndex >= MAX_WORKSHEET_ROWS
  ) {
    return data;
  }

  const columns = data.columns.map((column) => ({
    ...column,
    values: [...column.values],
  }));

  while (columns.length <= colIndex && columns.length < MAX_WORKSHEET_COLUMNS) {
    columns.push({
      id: nextColumnId({ columns }),
      name: nextColumnName({ columns }),
      values: [],
    });
  }

  const column = columns[colIndex];
  if (!column) return data;

  const nextValues = [...column.values];
  while (nextValues.length <= rowIndex) nextValues.push("");
  nextValues[rowIndex] = sanitizeCell(value);
  column.values = trimTrailingEmpty(nextValues);

  return { columns };
}

export function renameColumn(
  data: WorksheetData,
  colIndex: number,
  name: string
): WorksheetData {
  const column = data.columns[colIndex];
  if (!column) return data;
  const next = data.columns.map((item, index) =>
    index === colIndex ? { ...item, name: sanitizeColumnName(name) } : item
  );
  return { columns: next };
}

export function insertColumn(data: WorksheetData, atIndex: number): WorksheetData {
  if (data.columns.length >= MAX_WORKSHEET_COLUMNS) return data;
  const index = Math.max(0, Math.min(atIndex, data.columns.length));
  const column: WorksheetColumn = {
    id: nextColumnId(data),
    name: nextColumnName(data),
    values: [],
  };
  const columns = [...data.columns];
  columns.splice(index, 0, column);
  return { columns };
}

export function deleteColumn(data: WorksheetData, colIndex: number): WorksheetData {
  if (data.columns.length <= 1) {
    return createEmptyWorksheet(1);
  }
  if (colIndex < 0 || colIndex >= data.columns.length) return data;
  return { columns: data.columns.filter((_, index) => index !== colIndex) };
}

export function insertRow(data: WorksheetData, atIndex: number): WorksheetData {
  const currentRows = rowCount(data);
  if (currentRows >= MAX_WORKSHEET_ROWS) return data;
  const index = Math.max(0, Math.min(atIndex, currentRows));
  return {
    columns: data.columns.map((column) => {
      const values = [...column.values];
      while (values.length < index) values.push("");
      values.splice(index, 0, "");
      return { ...column, values: trimTrailingEmpty(values) };
    }),
  };
}

export function deleteRow(data: WorksheetData, rowIndex: number): WorksheetData {
  if (rowIndex < 0) return data;
  return {
    columns: data.columns.map((column) => {
      if (rowIndex >= column.values.length) return column;
      const values = column.values.filter((_, index) => index !== rowIndex);
      return { ...column, values: trimTrailingEmpty(values) };
    }),
  };
}

export function parseTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized === "") return [[""]];
  const lines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  return lines.map((line) => line.split("\t"));
}

export function pasteTsv(
  data: WorksheetData,
  colIndex: number,
  rowIndex: number,
  text: string
): WorksheetData {
  const grid = parseTsv(text);
  let next = data;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 0; c < row.length; c++) {
      next = setCell(next, colIndex + c, rowIndex + r, row[c] ?? "");
    }
  }
  return next;
}

export function parseNumericCell(raw: string): number | null {
  let text = raw.trim();
  if (text === "") return null;
  if (text.endsWith("%")) text = text.slice(0, -1).trim();
  text = text.replace(/,/g, "");
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return value;
}

export function columnNumericValues(column: WorksheetColumn): {
  values: number[];
  skipped: number;
} {
  const trimmed = trimTrailingEmpty(column.values);
  const values: number[] = [];
  let skipped = 0;
  for (const cell of trimmed) {
    if (cell.trim() === "") continue;
    const parsed = parseNumericCell(cell);
    if (parsed === null) {
      skipped += 1;
      continue;
    }
    values.push(parsed);
  }
  return { values, skipped };
}

export function findColumn(
  data: WorksheetData,
  columnId: string
): WorksheetColumn | undefined {
  return data.columns.find((column) => column.id === columnId);
}

export function findColumnIndex(
  data: WorksheetData,
  columnId: string
): number {
  return data.columns.findIndex((column) => column.id === columnId);
}

export function findColumnIndexByName(
  data: WorksheetData,
  name: string
): number {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return -1;
  return data.columns.findIndex(
    (column) => column.name.trim().toLowerCase() === trimmed
  );
}

/** Stable preimage used by `hashColumnSource` (server) and stale detection (client). */
export function columnSourceKey(column: WorksheetColumn): string {
  return JSON.stringify(trimTrailingEmpty(column.values));
}

export function replaceColumnValues(
  data: WorksheetData,
  colIndex: number,
  values: string[],
  name?: string
): WorksheetData {
  const column = data.columns[colIndex];
  if (!column) return data;
  const nextValues = trimTrailingEmpty(
    values.slice(0, MAX_WORKSHEET_ROWS).map(sanitizeCell)
  );
  return {
    columns: data.columns.map((item, index) =>
      index === colIndex
        ? {
            ...item,
            name: name !== undefined ? sanitizeColumnName(name) : item.name,
            values: nextValues,
          }
        : item
    ),
  };
}
