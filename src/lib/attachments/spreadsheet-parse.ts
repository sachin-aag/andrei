import ExcelJS from "exceljs";
import { classifyCell, type CellType, type DetectedTable } from "@/lib/attachments/table-extract";

export const MAX_SPREADSHEET_SHEETS = 50;
export const MAX_SPREADSHEET_COLUMNS = 64;
export const MAX_SPREADSHEET_ROWS_PER_SHEET = 20_000;
export const MAX_SPREADSHEET_CELLS = 250_000;
/** Row windows per pseudo-page so chat/retrieval stay page-sized. */
export const SPREADSHEET_PAGE_ROWS = 80;

export type SpreadsheetLimits = {
  maxSheets: number;
  maxColumns: number;
  maxRowsPerSheet: number;
  maxCells: number;
};

export const DEFAULT_SPREADSHEET_LIMITS: SpreadsheetLimits = {
  maxSheets: MAX_SPREADSHEET_SHEETS,
  maxColumns: MAX_SPREADSHEET_COLUMNS,
  maxRowsPerSheet: MAX_SPREADSHEET_ROWS_PER_SHEET,
  maxCells: MAX_SPREADSHEET_CELLS,
};

export type SpreadsheetSheet = {
  name: string;
  columns: string[];
  rows: string[][];
};

export type SpreadsheetDocument = {
  sheets: SpreadsheetSheet[];
};

export type SpreadsheetPage = {
  pageNumber: number;
  sheetName: string;
  text: string;
};

function assertWithinLimits(
  sheets: readonly SpreadsheetSheet[],
  limits: SpreadsheetLimits
): void {
  if (sheets.length > limits.maxSheets) {
    throw new Error(
      `Spreadsheet has too many sheets (max ${limits.maxSheets})`
    );
  }
  let cells = 0;
  for (const sheet of sheets) {
    if (sheet.columns.length > limits.maxColumns) {
      throw new Error(
        `Spreadsheet has too many columns (max ${limits.maxColumns})`
      );
    }
    if (sheet.rows.length > limits.maxRowsPerSheet) {
      throw new Error(
        `Spreadsheet has too many rows (max ${limits.maxRowsPerSheet} per sheet)`
      );
    }
    cells += (sheet.columns.length + 1) * (sheet.rows.length + 1);
    if (cells > limits.maxCells) {
      throw new Error(
        `Spreadsheet has too many cells (max ${limits.maxCells})`
      );
    }
  }
}

function decodeCsvText(buffer: Buffer): string {
  if (buffer.length === 0) {
    throw new Error("File is not a valid CSV");
  }
  // ZIP magic — an .xlsx renamed to .csv.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    throw new Error("File is not a valid CSV");
  }
  const isUtf16Le = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
  const isUtf16Be = buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff;
  // UTF-16 stores ASCII with NUL padding; skip the binary check for those BOMs.
  if (!isUtf16Le && !isUtf16Be) {
    for (const byte of buffer) {
      if (byte === 0) {
        throw new Error("File is not a valid CSV");
      }
    }
  }
  let text: string;
  if (isUtf16Le) {
    text = buffer.subarray(2).toString("utf16le");
  } else if (isUtf16Be) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1]!;
      swapped[i - 1] = buffer[i]!;
    }
    text = swapped.toString("utf16le");
  } else if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    text = buffer.subarray(3).toString("utf8");
  } else {
    text = buffer.toString("utf8");
  }
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function delimiterFromSample(sample: string): "," | ";" | "\t" {
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  let inQuotes = false;
  for (let i = 0; i < sample.length; i += 1) {
    const ch = sample[i];
    if (ch === '"') {
      if (inQuotes && sample[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ",") commas += 1;
    else if (ch === ";") semis += 1;
    else if (ch === "\t") tabs += 1;
  }
  if (tabs >= commas && tabs >= semis && tabs > 0) return "\t";
  if (semis > commas) return ";";
  return ",";
}

/**
 * RFC 4180 CSV (comma / semicolon / tab) into raw rows. Does not treat the
 * first row as a header — callers decide.
 */
export function parseCsvRecords(
  text: string,
  options: { maxRows?: number; maxColumns?: number } = {}
): string[][] {
  const maxRows = options.maxRows ?? MAX_SPREADSHEET_ROWS_PER_SHEET;
  const maxColumns = options.maxColumns ?? MAX_SPREADSHEET_COLUMNS;
  const delimiter = delimiterFromSample(text.slice(0, 8_192));
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    if (row.length >= maxColumns) {
      throw new Error(
        `Spreadsheet has too many columns (max ${maxColumns})`
      );
    }
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "" && records.length === 0) {
      row = [];
      return;
    }
    if (row.every((cell) => cell.trim() === "") && records.length === 0) {
      row = [];
      return;
    }
    if (records.length >= maxRows) {
      throw new Error(
        `Spreadsheet has too many rows (max ${maxRows} per sheet)`
      );
    }
    records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    field += ch;
  }
  if (inQuotes) {
    throw new Error("File is not a valid CSV");
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return records;
}

function sheetFromRecords(name: string, records: string[][]): SpreadsheetSheet | null {
  const width = records.reduce((max, row) => Math.max(max, row.length), 0);
  if (width === 0) return null;
  const normalized = records.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push("");
    return next;
  });
  while (
    normalized.length > 0 &&
    normalized[normalized.length - 1]!.every((cell) => cell.trim() === "")
  ) {
    normalized.pop();
  }
  if (normalized.length === 0) return null;

  const headerSource = normalized[0]!;
  const headerIsBlank = headerSource.every((cell) => cell.trim() === "");
  const columns = headerIsBlank
    ? headerSource.map((_, index) => columnLetter(index))
    : headerSource.map((cell, index) => cell.trim() || columnLetter(index));
  const dataRows = headerIsBlank ? normalized : normalized.slice(1);
  if (columns.every((name) => name.trim() === "") && dataRows.length === 0) {
    return null;
  }
  return { name, columns, rows: dataRows };
}

function columnLetter(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function parseCsvBuffer(
  buffer: Buffer,
  limits: SpreadsheetLimits = DEFAULT_SPREADSHEET_LIMITS
): SpreadsheetDocument {
  const records = parseCsvRecords(decodeCsvText(buffer), {
    maxRows: limits.maxRowsPerSheet + 1,
    maxColumns: limits.maxColumns,
  });
  const sheet = sheetFromRecords("Sheet1", records);
  const sheets = sheet ? [sheet] : [];
  if (sheets.length === 0) {
    throw new Error("File is not a valid CSV");
  }
  assertWithinLimits(sheets, limits);
  return { sheets };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof value !== "object") return String(value);
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? "").join("");
  }
  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }
  if ("result" in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  if ("error" in value && typeof value.error === "string") {
    return value.error;
  }
  if ("formula" in value && typeof value.formula === "string") {
    return "";
  }
  return "";
}

export async function parseXlsxBuffer(
  buffer: Buffer,
  limits: SpreadsheetLimits = DEFAULT_SPREADSHEET_LIMITS
): Promise<SpreadsheetDocument> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error("File is not a valid Excel .xlsx workbook");
  }
  if (workbook.worksheets.length > limits.maxSheets) {
    throw new Error(
      `Spreadsheet has too many sheets (max ${limits.maxSheets})`
    );
  }
  const sheets: SpreadsheetSheet[] = [];
  for (const worksheet of workbook.worksheets) {
    const actualColumns = Math.max(
      worksheet.actualColumnCount ?? 0,
      worksheet.columnCount ?? 0
    );
    const actualRows = Math.max(
      worksheet.actualRowCount ?? 0,
      worksheet.rowCount ?? 0
    );
    if (actualColumns > limits.maxColumns) {
      throw new Error(
        `Spreadsheet has too many columns (max ${limits.maxColumns})`
      );
    }
    if (actualRows > limits.maxRowsPerSheet + 1) {
      throw new Error(
        `Spreadsheet has too many rows (max ${limits.maxRowsPerSheet} per sheet)`
      );
    }
    const columnCount = actualColumns;
    const rowCount = actualRows;
    if (columnCount === 0 || rowCount === 0) continue;
    const records: string[][] = [];
    for (let r = 1; r <= rowCount; r += 1) {
      const row = worksheet.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= columnCount; c += 1) {
        cells.push(cellText(row.getCell(c).value));
      }
      records.push(cells);
    }
    const sheet = sheetFromRecords(worksheet.name || `Sheet${sheets.length + 1}`, records);
    if (sheet) sheets.push(sheet);
  }
  if (sheets.length === 0) {
    throw new Error("File is not a valid Excel .xlsx workbook");
  }
  assertWithinLimits(sheets, limits);
  return { sheets };
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function sheetToTranscript(sheet: SpreadsheetSheet): string {
  const header = sheet.columns.map(escapeMarkdownCell).join(" | ");
  const divider = sheet.columns.map(() => "---").join(" | ");
  const body = sheet.rows.map((row) =>
    sheet.columns
      .map((_, index) => escapeMarkdownCell(row[index] ?? ""))
      .join(" | ")
  );
  const table = [header, divider, ...body].join("\n");
  return `Sheet: ${sheet.name}\n\n${table}`.trim();
}

export function buildSpreadsheetPages(
  document: SpreadsheetDocument,
  pageRows: number = SPREADSHEET_PAGE_ROWS
): SpreadsheetPage[] {
  const pages: SpreadsheetPage[] = [];
  const windowSize = Math.max(1, pageRows);
  for (const sheet of document.sheets) {
    if (sheet.rows.length === 0) {
      pages.push({
        pageNumber: pages.length + 1,
        sheetName: sheet.name,
        text: sheetToTranscript(sheet),
      });
      continue;
    }
    for (let start = 0; start < sheet.rows.length; start += windowSize) {
      const slice: SpreadsheetSheet = {
        name: sheet.name,
        columns: sheet.columns,
        rows: sheet.rows.slice(start, start + windowSize),
      };
      const end = Math.min(start + windowSize, sheet.rows.length);
      const heading =
        sheet.rows.length > windowSize
          ? `Sheet: ${sheet.name} (rows ${start + 1}–${end})`
          : `Sheet: ${sheet.name}`;
      const header = slice.columns.map(escapeMarkdownCell).join(" | ");
      const divider = slice.columns.map(() => "---").join(" | ");
      const body = slice.rows.map((row) =>
        slice.columns
          .map((_, index) => escapeMarkdownCell(row[index] ?? ""))
          .join(" | ")
      );
      pages.push({
        pageNumber: pages.length + 1,
        sheetName: sheet.name,
        text: `${heading}\n\n${[header, divider, ...body].join("\n")}`,
      });
    }
  }
  return pages;
}

function columnTypes(columns: readonly string[], rows: readonly string[][]): CellType[] {
  return columns.map((_, index) => {
    const counts: Record<CellType, number> = {
      date: 0,
      time: 0,
      number: 0,
      text: 0,
    };
    for (const row of rows) {
      const value = row[index] ?? "";
      if (value.trim() === "") continue;
      counts[classifyCell(value)] += 1;
    }
    let best: CellType = "text";
    let bestCount = -1;
    for (const type of ["number", "date", "time", "text"] as const) {
      if (counts[type] > bestCount) {
        best = type;
        bestCount = counts[type];
      }
    }
    return best;
  });
}

export function spreadsheetTables(
  document: SpreadsheetDocument,
  pages: readonly SpreadsheetPage[]
): DetectedTable[] {
  const pageBySheet = new Map<string, { start: number; end: number }>();
  for (const page of pages) {
    const span = pageBySheet.get(page.sheetName);
    if (!span) {
      pageBySheet.set(page.sheetName, {
        start: page.pageNumber,
        end: page.pageNumber,
      });
    } else {
      span.end = page.pageNumber;
    }
  }
  return document.sheets.map((sheet) => {
    const span = pageBySheet.get(sheet.name) ?? { start: 1, end: 1 };
    const types = columnTypes(sheet.columns, sheet.rows);
    const windowSize = SPREADSHEET_PAGE_ROWS;
    return {
      columns: sheet.columns.map((name, index) => ({
        name,
        type: types[index] ?? "text",
      })),
      rows: sheet.rows.map((values, index) => ({
        values: sheet.columns.map((_, col) => values[col] ?? ""),
        pageNumber: span.start + Math.floor(index / windowSize),
      })),
      pageStart: span.start,
      pageEnd: span.end,
      signature: `spreadsheet:${sheet.name}`,
    };
  });
}

export function spreadsheetSummary(document: SpreadsheetDocument, maxChars: number): string {
  const parts = document.sheets.map((sheet) => {
    const previewRows = sheet.rows
      .slice(0, 12)
      .map((row) => row.join(" | "))
      .join("\n");
    return `${sheet.name} (${sheet.rows.length} rows)\n${sheet.columns.join(" | ")}\n${previewRows}`;
  });
  return parts.join("\n\n").slice(0, maxChars);
}
