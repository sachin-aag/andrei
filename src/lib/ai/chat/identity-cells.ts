import type { JSONContent } from "@tiptap/core";
import { summarizeTablesInDoc } from "@/lib/suggestions/table-operation";

/**
 * Document / SOP / protocol / report / reference number columns. Named rows
 * with these cells blank are missing identifiers, not a finished table.
 */
const IDENTITY_VALUE_HEADER_RE =
  /\b(?:document|sop|reference|protocol|report)\s+(?:number|no\.?)\b/i;

const IDENTITY_VALUE_HEADER_PAIR_RE =
  /\b(?:number|no\.?)\b/i;

const IDENTITY_VALUE_HEADER_NOUN_RE =
  /\b(?:document|sop|reference|protocol|report)\b/i;

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isIdentityValueHeader(header: string): boolean {
  const needle = normalizeHeader(header);
  if (!needle) return false;
  if (IDENTITY_VALUE_HEADER_RE.test(needle)) return true;
  return (
    IDENTITY_VALUE_HEADER_PAIR_RE.test(needle) &&
    IDENTITY_VALUE_HEADER_NOUN_RE.test(needle)
  );
}

function isBlankCellText(text: string): boolean {
  return text === "(empty)" || text.trim() === "";
}

function rowHasLabel(cells: ReadonlyArray<{ col: number; text: string }>): boolean {
  return cells.some((cell) => cell.col === 0 && !isBlankCellText(cell.text));
}

/**
 * True when a named data row still has a blank identity-number cell
 * (Reference Number, SOP Number, Document Number, …).
 */
export function tableHasEmptyIdentityValueCells(doc: JSONContent): boolean {
  for (const table of summarizeTablesInDoc(doc)) {
    const valueCols = table.headers.flatMap((header, col) =>
      isIdentityValueHeader(header) ? [col] : []
    );
    if (valueCols.length === 0) continue;
    for (let row = 1; row <= table.dataRowCount; row++) {
      const rowCells = table.cells.filter((cell) => cell.row === row);
      if (!rowHasLabel(rowCells)) continue;
      if (
        valueCols.some((col) =>
          isBlankCellText(
            rowCells.find((cell) => cell.col === col)?.text ?? ""
          )
        )
      ) {
        return true;
      }
    }
  }
  return false;
}
