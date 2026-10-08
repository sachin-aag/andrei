import { inflateRawSync } from "node:zlib";
import {
  assertZipSafetyLimits,
  DEFAULT_DOCX_ZIP_SAFETY_LIMITS,
  listZipCentralDirectory,
  type ZipCentralEntry,
  type ZipSafetyLimits,
} from "@/lib/attachments/zip-safety";

export type ValidateXlsxResult = {
  /** Spreadsheets have no PDF page model; a sentinel keeps the stored gate happy. */
  pageCount: number;
};

export type ValidateXlsxOptions = {
  zipLimits?: ZipSafetyLimits;
};

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;
const ARCHIVE_LABEL = "Excel .xlsx";

/**
 * Validate an uploaded `.xlsx` (OOXML) buffer. Checks ZIP magic, zip-bomb
 * limits, and that the archive contains the workbook part — without fully
 * expanding it first. ExcelJS load happens at ingest.
 */
export function validateXlsx(
  buffer: Buffer,
  options: ValidateXlsxOptions = {}
): ValidateXlsxResult {
  if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new Error("File is not an Excel .xlsx workbook");
  }

  const limits = options.zipLimits ?? DEFAULT_DOCX_ZIP_SAFETY_LIMITS;
  let entries: ZipCentralEntry[];
  try {
    entries = listZipCentralDirectory(buffer, { archiveLabel: ARCHIVE_LABEL });
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Excel .xlsx could not be parsed");
  }

  assertZipSafetyLimits(entries, limits, { archiveLabel: ARCHIVE_LABEL });

  const hasWorkbookXml = entries.some(
    (entry) =>
      entry.fileName === "xl/workbook.xml" ||
      entry.fileName === "xl\\workbook.xml"
  );
  if (!hasWorkbookXml) {
    throw new Error("File is not a valid Excel .xlsx workbook");
  }

  for (const entry of entries) {
    if (entry.fileName.endsWith("/")) continue;
    if (entry.compressedSize === 0 && entry.uncompressedSize === 0) continue;
    assertEntryInflatesWithinLimit(
      buffer,
      entry,
      limits.maxEntryUncompressedBytes
    );
  }

  return { pageCount: 1 };
}

function assertEntryInflatesWithinLimit(
  buffer: Buffer,
  entry: ZipCentralEntry,
  maxUncompressedBytes: number
): void {
  if (entry.localHeaderOffset + 30 > buffer.length) {
    throw new Error("Excel .xlsx archive is truncated");
  }
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Excel .xlsx archive is corrupted");
  }
  const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) {
    throw new Error("Excel .xlsx archive is truncated");
  }
  const compressed = buffer.subarray(dataStart, dataEnd);

  if (entry.compressionMethod === COMPRESSION_STORED) {
    if (compressed.length > maxUncompressedBytes) {
      throw new Error("Excel .xlsx contains an oversized archive entry");
    }
    return;
  }
  if (entry.compressionMethod !== COMPRESSION_DEFLATE) {
    throw new Error("Excel .xlsx uses an unsupported compression method");
  }

  try {
    inflateRawSync(compressed, {
      maxOutputLength: Math.min(entry.uncompressedSize, maxUncompressedBytes),
    });
  } catch {
    throw new Error("Excel .xlsx contains an oversized or corrupt archive entry");
  }
}
