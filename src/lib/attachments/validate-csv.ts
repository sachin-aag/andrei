import { parseCsvBuffer } from "@/lib/attachments/spreadsheet-parse";

export type ValidateCsvResult = {
  pageCount: number;
};

/**
 * Validate an uploaded `.csv` buffer. Rejects binary/empty files and enforces
 * the spreadsheet row/column/cell caps used at ingest.
 */
export function validateCsv(buffer: Buffer): ValidateCsvResult {
  parseCsvBuffer(buffer);
  return { pageCount: 1 };
}
