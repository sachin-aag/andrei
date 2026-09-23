/**
 * Deterministic table extraction from born-digital PDF text.
 *
 * Instrument prints (SCADA historian exports, chromatography runs, datalogger
 * dumps) are tables of numbers that the retrieval path cannot serve: every page
 * embeds to nearly the same point, and FTS on "192.4" is noise. They are also
 * born-digital, so `readPdfTextLayer` already stored the exact characters in
 * `document_pages.transcript` — the numbers are in the database verbatim, just
 * as prose. This turns them back into typed rows.
 *
 * The detector is grammar-based rather than instrument-specific: a data row is
 * recognised by the *shape* of its cells (date, time, number, text), and the
 * dominant repeating shape across a document is its table body. Nothing here
 * knows what a lyophilizer is.
 */

export type CellType = "date" | "time" | "number" | "text";

export type DetectedColumn = {
  name: string;
  type: CellType;
};

export type DetectedRow = {
  /** Raw cell strings, one per column, in column order. */
  values: string[];
  /** 1-based document page this row was read from. */
  pageNumber: number;
};

export type DetectedTable = {
  columns: DetectedColumn[];
  rows: DetectedRow[];
  /** Page span the rows were drawn from, inclusive. */
  pageStart: number;
  pageEnd: number;
  /** Shape signature, e.g. "date|time|number x9". Diagnostics only. */
  signature: string;
};

export type ExtractablePage = {
  pageNumber: number;
  text: string;
};

/**
 * A repeating shape needs at least this many rows before it is a table rather
 * than a coincidence. Running headers and address blocks repeat too.
 */
export const MIN_TABLE_ROWS = 8;

/** Below this, a "row" is more likely a sentence fragment than a record. */
const MIN_COLUMNS = 3;

/** Numeric columns are what make a table worth extracting. */
const MIN_NUMERIC_COLUMNS = 1;

/**
 * Minimum share of a row that must be numeric or temporal. Below this the
 * "row" is prose that happens to contain a figure — a page footer, a revision
 * line, a sentence with a date in it.
 */
const DATA_CELL_RATIO = 0.5;

const DATE_RE = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
// Accepts 1000.0000, -45.0, 1,234.5, +3, 12%. Rejects bare "-" and "1.2.3".
const NUMBER_RE = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

export function classifyCell(raw: string): CellType {
  const value = raw.trim();
  if (DATE_RE.test(value)) return "date";
  if (TIME_RE.test(value)) return "time";
  if (NUMBER_RE.test(value)) return "number";
  return "text";
}

/** Whitespace-separated cells. Instrument prints are column-aligned text. */
function splitCells(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

function shapeOf(cells: readonly string[]): CellType[] {
  return cells.map(classifyCell);
}

/**
 * Grouping class. Date and time are structural — they anchor a record — but a
 * value cell may legitimately be either a number or a marker (`OOT`, `N/A`,
 * `<LOQ`, `---`). Grouping on the raw shape would split those rows into their
 * own signature and drop them, which loses precisely the readings an
 * investigator cares about.
 */
function groupClass(type: CellType): string {
  return type === "date" || type === "time" ? type : "value";
}

function signatureOf(shape: readonly CellType[]): string {
  return shape.map(groupClass).join("|");
}

/** "date|time|number x9" reads better in diagnostics than 11 pipe-separated words. */
function readableSignature(shape: readonly string[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < shape.length) {
    let run = 1;
    while (i + run < shape.length && shape[i + run] === shape[i]) run += 1;
    parts.push(run > 1 ? `${shape[i]} x${run}` : String(shape[i]));
    i += run;
  }
  return parts.join("|");
}

type Candidate = {
  shape: CellType[];
  rows: DetectedRow[];
  /** Lines immediately above each first-of-page row, for header recovery. */
  preceding: string[][];
};

function isDataShape(shape: readonly CellType[]): boolean {
  if (shape.length < MIN_COLUMNS) return false;
  const numeric = shape.filter((t) => t === "number").length;
  // At least one genuinely numeric cell, so a repeated header or units line
  // never opens a group of its own.
  if (numeric < MIN_NUMERIC_COLUMNS) return false;
  // A record is mostly data. A running footer such as
  // "Requirements Document Template, 731-00003 Rev. A Page 1 of 49" repeats on
  // every page and carries two numbers, so a bare "has a number" test detects
  // it as a 49-row table. Require data cells to be at least half the row.
  const structural = shape.filter(
    (t) => t === "date" || t === "time"
  ).length;
  return (numeric + structural) / shape.length >= DATA_CELL_RATIO;
}

/**
 * Header recovery. The header sits above the first data row, has the same cell
 * count, and is not itself numeric. Instrument prints often put a units line
 * between them (`°C °C ubar`), so scan a few lines up rather than one.
 */
function recoverHeader(
  preceding: readonly string[][],
  width: number
): string[] | null {
  for (const lines of preceding) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const cells = splitCells(lines[i] ?? "");
      if (cells.length !== width) continue;
      const shape = shapeOf(cells);
      if (shape.every((t) => t === "text")) return cells;
    }
  }
  return null;
}

/**
 * Column type from the observed cells rather than the first row: a column is
 * numeric only if every non-empty cell parses as a number, so one stray
 * footnote marker does not silently turn a data column into text.
 */
function columnType(rows: readonly DetectedRow[], index: number): CellType {
  const types = new Set<CellType>();
  for (const row of rows) {
    const cell = row.values[index];
    if (!cell || !cell.trim()) continue;
    types.add(classifyCell(cell));
  }
  if (types.size === 1) return [...types][0]!;
  // Mixed date/time/number in one column means it is not a clean data column.
  return "text";
}

/**
 * Detect the repeating tables in a document's pages.
 *
 * Returns tables ordered by row count, largest first — the instrument series is
 * what callers almost always want, and running headers never reach
 * `MIN_TABLE_ROWS` of a numeric shape.
 */
export function detectTables(
  pages: readonly ExtractablePage[]
): DetectedTable[] {
  const candidates = new Map<string, Candidate>();

  for (const page of pages) {
    const lines = page.text.split(/\r?\n/);
    const recentLines: string[] = [];
    const sawRowOnThisPage = new Set<string>();

    for (const line of lines) {
      const cells = splitCells(line);
      if (cells.length === 0) {
        recentLines.push(line);
        if (recentLines.length > 8) recentLines.shift();
        continue;
      }
      const shape = shapeOf(cells);
      if (!isDataShape(shape)) {
        recentLines.push(line);
        if (recentLines.length > 8) recentLines.shift();
        continue;
      }
      const key = signatureOf(shape);
      let candidate = candidates.get(key);
      if (!candidate) {
        candidate = { shape, rows: [], preceding: [] };
        candidates.set(key, candidate);
      }
      // Capture the lines above the first occurrence on each page; the header
      // repeats per page and any one of them will do.
      if (!sawRowOnThisPage.has(key)) {
        sawRowOnThisPage.add(key);
        candidate.preceding.push([...recentLines]);
      }
      candidate.rows.push({ values: cells, pageNumber: page.pageNumber });
      recentLines.length = 0;
    }
  }

  const tables: DetectedTable[] = [];
  for (const candidate of candidates.values()) {
    if (candidate.rows.length < MIN_TABLE_ROWS) continue;
    const width = candidate.shape.length;
    const header = recoverHeader(candidate.preceding, width);
    const columns: DetectedColumn[] = Array.from({ length: width }, (_, i) => ({
      name: header?.[i]?.trim() || `C${i + 1}`,
      type: columnType(candidate.rows, i),
    }));
    const pageNumbers = candidate.rows.map((r) => r.pageNumber);
    tables.push({
      columns,
      rows: candidate.rows,
      pageStart: Math.min(...pageNumbers),
      pageEnd: Math.max(...pageNumbers),
      signature: readableSignature(candidate.shape.map(groupClass)),
    });
  }

  return tables.sort((a, b) => b.rows.length - a.rows.length);
}

/** Cells of one column, in row order. Used to load a worksheet column. */
export function columnValues(
  table: DetectedTable,
  columnName: string
): string[] | null {
  const index = table.columns.findIndex(
    (c) => c.name.toLowerCase() === columnName.trim().toLowerCase()
  );
  if (index < 0) return null;
  return table.rows.map((r) => r.values[index] ?? "");
}

/** Pages each row of a column came from, aligned with `columnValues`. */
export function columnPages(table: DetectedTable): number[] {
  return table.rows.map((r) => r.pageNumber);
}
