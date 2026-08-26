import {
  MAX_CELL_LENGTH,
  MAX_COLUMN_NAME_LENGTH,
  MAX_DATA_SHEETS,
  MAX_WORKSHEET_COLUMNS,
  MAX_WORKSHEET_ROWS,
  MIN_VISIBLE_COLUMNS,
  PRIMARY_DATA_SHEET_ID,
  SPECS_TAB_ID,
  type WorksheetColumn,
  type WorksheetData,
  type WorksheetSheet,
  type WorksheetSpecRow,
} from "./types";
import type { AnalysisRowSelection } from "./row-selection";

export function defaultColumnName(index: number): string {
  return `C${index + 1}`;
}

export function defaultColumnId(index: number): string {
  return `c${index + 1}`;
}

function emptyColumns(columnCount = MIN_VISIBLE_COLUMNS): WorksheetColumn[] {
  const count = Math.min(
    MAX_WORKSHEET_COLUMNS,
    Math.max(1, Math.floor(columnCount))
  );
  return Array.from({ length: count }, (_, i) => ({
    id: defaultColumnId(i),
    name: defaultColumnName(i),
    values: [],
  }));
}

export function createEmptyWorksheet(
  columnCount = MIN_VISIBLE_COLUMNS
): WorksheetData {
  const columns = emptyColumns(columnCount);
  return {
    columns,
    sheets: [{ id: PRIMARY_DATA_SHEET_ID, name: "Data", columns }],
    specs: [],
    activeSheetId: PRIMARY_DATA_SHEET_ID,
  };
}

function asSheet(value: unknown): WorksheetSheet | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<WorksheetSheet>;
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  if (!Array.isArray(raw.columns) || raw.columns.length === 0) return null;
  return {
    id: raw.id.trim(),
    name: raw.name.trim().slice(0, 40),
    columns: raw.columns as WorksheetColumn[],
  };
}

function asSpecRow(value: unknown): WorksheetSpecRow | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<WorksheetSpecRow>;
  if (typeof raw.columnName !== "string" || !raw.columnName.trim()) return null;
  return {
    columnName: raw.columnName.trim().slice(0, MAX_COLUMN_NAME_LENGTH),
    lsl: typeof raw.lsl === "string" ? raw.lsl : "",
    usl: typeof raw.usl === "string" ? raw.usl : "",
    target: typeof raw.target === "string" ? raw.target : "",
  };
}

/**
 * Accepts the current workbook shape and the pre-sheets `{ columns }` JSON
 * still stored on older reports.
 */
export function normalizeWorksheet(raw: unknown): WorksheetData {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallback = createEmptyWorksheet();
  const legacyColumns = Array.isArray(record.columns)
    ? (record.columns as WorksheetColumn[])
    : null;
  const parsedSheets = Array.isArray(record.sheets)
    ? record.sheets.flatMap((item) => {
        const sheet = asSheet(item);
        return sheet ? [sheet] : [];
      })
    : [];
  const sheets =
    parsedSheets.length > 0
      ? parsedSheets
      : [
          {
            id: PRIMARY_DATA_SHEET_ID,
            name: "Data",
            columns:
              legacyColumns && legacyColumns.length > 0
                ? legacyColumns
                : fallback.columns,
          },
        ];
  const specs = Array.isArray(record.specs)
    ? record.specs.flatMap((item) => {
        const row = asSpecRow(item);
        return row ? [row] : [];
      })
    : [];
  const requested =
    typeof record.activeSheetId === "string" ? record.activeSheetId : "";
  const activeSheetId =
    requested === SPECS_TAB_ID || sheets.some((sheet) => sheet.id === requested)
      ? requested
      : sheets[0]!.id;
  const active =
    activeSheetId === SPECS_TAB_ID
      ? sheets[0]!
      : (sheets.find((sheet) => sheet.id === activeSheetId) ?? sheets[0]!);
  return {
    columns: active.columns,
    sheets,
    specs,
    activeSheetId,
  };
}

function sheetIdForColumns(
  workbook: WorksheetData,
  columns: WorksheetColumn[]
): string {
  if (workbook.activeSheetId !== SPECS_TAB_ID) return workbook.activeSheetId;
  const firstId = columns[0]?.id;
  const match = workbook.sheets.find((sheet) =>
    sheet.columns.some((column) => column.id === firstId)
  );
  return match?.id ?? workbook.sheets[0]!.id;
}

function withWorkbook(
  data: WorksheetData,
  columns: WorksheetColumn[]
): WorksheetData {
  const workbook = normalizeWorksheet(data);
  const sheetId = sheetIdForColumns(workbook, columns);
  return {
    ...workbook,
    columns,
    sheets: workbook.sheets.map((sheet) =>
      sheet.id === sheetId ? { ...sheet, columns } : sheet
    ),
  };
}

export function dataSheets(data: WorksheetData): WorksheetSheet[] {
  return normalizeWorksheet(data).sheets;
}

export function isSpecsTab(data: WorksheetData): boolean {
  return normalizeWorksheet(data).activeSheetId === SPECS_TAB_ID;
}

export function switchWorksheetTab(
  data: WorksheetData,
  sheetId: string
): WorksheetData {
  const workbook = normalizeWorksheet(data);
  if (sheetId === SPECS_TAB_ID) {
    return { ...workbook, activeSheetId: SPECS_TAB_ID };
  }
  const sheet = workbook.sheets.find((item) => item.id === sheetId);
  if (!sheet) return workbook;
  return {
    ...workbook,
    activeSheetId: sheet.id,
    columns: sheet.columns,
  };
}

function nextSheetId(data: WorksheetData): string {
  let max = data.sheets.length;
  for (const sheet of data.sheets) {
    const match = /^data-(\d+)$/i.exec(sheet.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `data-${max + 1}`;
}

function nextSheetName(data: WorksheetData): string {
  const used = new Set(data.sheets.map((sheet) => sheet.name.toLowerCase()));
  let index = data.sheets.length + 1;
  let name = `Data ${index}`;
  while (used.has(name.toLowerCase())) {
    index += 1;
    name = `Data ${index}`;
  }
  return name;
}

export function addDataSheet(data: WorksheetData): WorksheetData {
  const workbook = normalizeWorksheet(data);
  if (workbook.sheets.length >= MAX_DATA_SHEETS) return workbook;
  const id = nextSheetId(workbook);
  const columns = emptyColumnsForWorkbook(workbook);
  const sheet: WorksheetSheet = {
    id,
    name: nextSheetName(workbook),
    columns,
  };
  return {
    ...workbook,
    sheets: [...workbook.sheets, sheet],
    activeSheetId: id,
    columns,
  };
}

export function renameDataSheet(
  data: WorksheetData,
  sheetId: string,
  name: string
): WorksheetData {
  const workbook = normalizeWorksheet(data);
  const nextName = name.trim().slice(0, 40);
  if (!nextName) return workbook;
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet) =>
      sheet.id === sheetId ? { ...sheet, name: nextName } : sheet
    ),
  };
}

export function deleteDataSheet(
  data: WorksheetData,
  sheetId: string
): WorksheetData {
  const workbook = normalizeWorksheet(data);
  if (workbook.sheets.length <= 1) return workbook;
  const remaining = workbook.sheets.filter((sheet) => sheet.id !== sheetId);
  if (remaining.length === workbook.sheets.length) return workbook;
  const nextActive =
    workbook.activeSheetId === sheetId
      ? remaining[0]!.id
      : workbook.activeSheetId === SPECS_TAB_ID
        ? SPECS_TAB_ID
        : remaining.some((sheet) => sheet.id === workbook.activeSheetId)
          ? workbook.activeSheetId
          : remaining[0]!.id;
  const active =
    nextActive === SPECS_TAB_ID
      ? remaining[0]!
      : (remaining.find((sheet) => sheet.id === nextActive) ?? remaining[0]!);
  return {
    ...workbook,
    sheets: remaining,
    activeSheetId: nextActive,
    columns: active.columns,
  };
}

function parseOptionalSpecNumber(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function specRowForColumn(
  data: WorksheetData,
  columnName: string
): WorksheetSpecRow | undefined {
  const key = columnName.trim().toLowerCase();
  if (!key) return undefined;
  return normalizeWorksheet(data).specs.find(
    (row) => row.columnName.trim().toLowerCase() === key
  );
}

export function upsertSpecRow(
  data: WorksheetData,
  row: WorksheetSpecRow
): WorksheetData {
  const workbook = normalizeWorksheet(data);
  const columnName = row.columnName.trim().slice(0, MAX_COLUMN_NAME_LENGTH);
  if (!columnName) return workbook;
  const nextRow: WorksheetSpecRow = {
    columnName,
    lsl: row.lsl.trim(),
    usl: row.usl.trim(),
    target: row.target.trim(),
  };
  const index = workbook.specs.findIndex(
    (item) => item.columnName.trim().toLowerCase() === columnName.toLowerCase()
  );
  const specs =
    index >= 0
      ? workbook.specs.map((item, i) => (i === index ? nextRow : item))
      : [...workbook.specs, nextRow];
  return { ...workbook, specs };
}

export function setSpecRows(
  data: WorksheetData,
  specs: WorksheetSpecRow[]
): WorksheetData {
  const workbook = normalizeWorksheet(data);
  return {
    ...workbook,
    specs: specs.map((row) => ({
      columnName: row.columnName.trim().slice(0, MAX_COLUMN_NAME_LENGTH),
      lsl: row.lsl.trim(),
      usl: row.usl.trim(),
      target: row.target.trim(),
    })),
  };
}

export function defaultSixpackLimits(input: {
  columnName: string;
  values: readonly number[];
  worksheet: WorksheetData;
}): { lsl: number | null; usl: number | null; target: number | null } {
  const named = specRowForColumn(input.worksheet, input.columnName);
  if (named) {
    const lsl = parseOptionalSpecNumber(named.lsl);
    const usl = parseOptionalSpecNumber(named.usl);
    const target = parseOptionalSpecNumber(named.target);
    if (lsl != null || usl != null || target != null) {
      return { lsl, usl, target };
    }
  }
  if (input.values.length === 0) {
    return { lsl: null, usl: null, target: null };
  }
  const min = Math.min(...input.values);
  const max = Math.max(...input.values);
  if (min === max) {
    return { lsl: min, usl: max, target: min };
  }
  return { lsl: min, usl: max, target: (min + max) / 2 };
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
  const workbook = normalizeWorksheet(data);
  let max = 0;
  const consider = (column: WorksheetColumn) => {
    const match = /^c(\d+)$/i.exec(column.id);
    if (match) max = Math.max(max, Number(match[1]));
  };
  for (const sheet of workbook.sheets) {
    for (const column of sheet.columns) consider(column);
  }
  // Caller may pass in-progress columns that are not a sheet yet
  // (e.g. allocating a new data sheet).
  for (const column of data.columns) consider(column);
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

function emptyColumnsForWorkbook(
  data: WorksheetData,
  columnCount = MIN_VISIBLE_COLUMNS
): WorksheetColumn[] {
  const count = Math.min(
    MAX_WORKSHEET_COLUMNS,
    Math.max(1, Math.floor(columnCount))
  );
  const columns: WorksheetColumn[] = [];
  for (let i = 0; i < count; i++) {
    const growing = { ...normalizeWorksheet(data), columns };
    columns.push({
      id: nextColumnId(growing),
      name: defaultColumnName(i),
      values: [],
    });
  }
  return columns;
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
    const growing = { ...data, columns };
    columns.push({
      id: nextColumnId(growing),
      name: nextColumnName(growing),
      values: [],
    });
  }

  const column = columns[colIndex];
  if (!column) return data;

  const nextValues = [...column.values];
  while (nextValues.length <= rowIndex) nextValues.push("");
  nextValues[rowIndex] = sanitizeCell(value);
  column.values = trimTrailingEmpty(nextValues);

  return withWorkbook(data, columns);
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
  return withWorkbook(data, next);
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
  return withWorkbook(data, columns);
}

export function deleteColumn(data: WorksheetData, colIndex: number): WorksheetData {
  if (data.columns.length <= 1) {
    return withWorkbook(data, emptyColumnsForWorkbook(data, 1));
  }
  if (colIndex < 0 || colIndex >= data.columns.length) return data;
  return withWorkbook(
    data,
    data.columns.filter((_, index) => index !== colIndex)
  );
}

export function insertRow(data: WorksheetData, atIndex: number): WorksheetData {
  const currentRows = rowCount(data);
  if (currentRows >= MAX_WORKSHEET_ROWS) return data;
  const index = Math.max(0, Math.min(atIndex, currentRows));
  return withWorkbook(
    data,
    data.columns.map((column) => {
      const values = [...column.values];
      while (values.length < index) values.push("");
      values.splice(index, 0, "");
      return { ...column, values: trimTrailingEmpty(values) };
    })
  );
}

export function deleteRow(data: WorksheetData, rowIndex: number): WorksheetData {
  if (rowIndex < 0) return data;
  return withWorkbook(
    data,
    data.columns.map((column) => {
      if (rowIndex >= column.values.length) return column;
      const values = column.values.filter((_, index) => index !== rowIndex);
      return { ...column, values: trimTrailingEmpty(values) };
    })
  );
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

export function cellsForRowSelection(
  column: WorksheetColumn,
  selection: AnalysisRowSelection
): string[] {
  switch (selection.mode) {
    case "all":
      return trimTrailingEmpty(column.values);
    case "range": {
      const start = Math.max(0, selection.start - 1);
      const requestedEnd = selection.end - 1;
      const lastFilled = column.values.length - 1;
      const end = Math.min(requestedEnd, Math.max(lastFilled, start));
      const out: string[] = [];
      for (let i = start; i <= end; i++) {
        out.push(column.values[i] ?? "");
      }
      return out;
    }
    case "from": {
      const start = Math.max(0, selection.start - 1);
      const end = column.values.length - 1;
      if (end < start) return [];
      return column.values.slice(start);
    }
    case "rows":
      return selection.rows.map((row) => column.values[row - 1] ?? "");
    default: {
      const exhaustive: never = selection;
      return exhaustive;
    }
  }
}

export function columnNumericValues(
  column: WorksheetColumn,
  selection: AnalysisRowSelection = { mode: "all" }
): {
  values: number[];
  skipped: number;
} {
  const cells = cellsForRowSelection(column, selection);
  const values: number[] = [];
  let skipped = 0;
  for (const cell of cells) {
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
  const workbook = normalizeWorksheet(data);
  for (const sheet of workbook.sheets) {
    const column = sheet.columns.find((item) => item.id === columnId);
    if (column) return column;
  }
  return workbook.columns.find((column) => column.id === columnId);
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

export function findSheetIdForColumn(
  data: WorksheetData,
  columnId: string
): string | null {
  const workbook = normalizeWorksheet(data);
  for (const sheet of workbook.sheets) {
    if (sheet.columns.some((column) => column.id === columnId)) return sheet.id;
  }
  return null;
}

export function findSheetIdForColumnName(
  data: WorksheetData,
  name: string
): string | null {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return null;
  const workbook = normalizeWorksheet(data);
  for (const sheet of workbook.sheets) {
    if (
      sheet.columns.some(
        (column) => column.name.trim().toLowerCase() === trimmed
      )
    ) {
      return sheet.id;
    }
  }
  return null;
}

/** Stable preimage used by `hashColumnSource` (server) and stale detection (client). */
export function analysisSourceKey(
  column: WorksheetColumn,
  selection: AnalysisRowSelection = { mode: "all" }
): string {
  return JSON.stringify(cellsForRowSelection(column, selection));
}

export function columnSourceKey(column: WorksheetColumn): string {
  return analysisSourceKey(column, { mode: "all" });
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
  return withWorkbook(
    data,
    data.columns.map((item, index) =>
      index === colIndex
        ? {
            ...item,
            name: name !== undefined ? sanitizeColumnName(name) : item.name,
            values: nextValues,
          }
        : item
    )
  );
}
