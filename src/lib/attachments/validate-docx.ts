import { inflateRawSync } from "node:zlib";
import {
  assertZipSafetyLimits,
  DEFAULT_DOCX_ZIP_SAFETY_LIMITS,
  listZipCentralDirectory,
  type ZipCentralEntry,
  type ZipSafetyLimits,
} from "@/lib/attachments/zip-safety";

export type ValidateDocxResult = {
  /** DOCX has no fixed page model; a sentinel keeps the "stored" gate happy. */
  pageCount: number;
};

export type ValidateDocxOptions = {
  zipLimits?: ZipSafetyLimits;
};

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

/**
 * Validate an uploaded `.docx` (OOXML) buffer. Checks ZIP magic, central-directory
 * size/ratio limits (zip-bomb guard), and that the archive contains the main
 * Word document part — without fully expanding the archive first.
 */
export function validateDocx(
  buffer: Buffer,
  options: ValidateDocxOptions = {}
): ValidateDocxResult {
  // ZIP local file header magic: PK\x03\x04.
  if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new Error("File is not a Word .docx document");
  }

  const limits = options.zipLimits ?? DEFAULT_DOCX_ZIP_SAFETY_LIMITS;
  let entries: ZipCentralEntry[];
  try {
    entries = listZipCentralDirectory(buffer);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Word .docx could not be parsed");
  }

  assertZipSafetyLimits(entries, limits);

  const hasDocumentXml = entries.some(
    (entry) => entry.fileName === "word/document.xml"
  );
  if (!hasDocumentXml) {
    throw new Error("File is not a valid Word .docx document");
  }

  // Cap-inflate every entry so forged central-directory sizes cannot expand
  // past limits when Mammoth later opens the archive.
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
    throw new Error("Word .docx archive is truncated");
  }
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Word .docx archive is corrupted");
  }
  const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) {
    throw new Error("Word .docx archive is truncated");
  }
  const compressed = buffer.subarray(dataStart, dataEnd);

  if (entry.compressionMethod === COMPRESSION_STORED) {
    if (compressed.length > maxUncompressedBytes) {
      throw new Error("Word .docx contains an oversized archive entry");
    }
    return;
  }
  if (entry.compressionMethod !== COMPRESSION_DEFLATE) {
    throw new Error("Word .docx uses an unsupported compression method");
  }

  try {
    inflateRawSync(compressed, {
      maxOutputLength: Math.min(entry.uncompressedSize, maxUncompressedBytes),
    });
  } catch {
    throw new Error("Word .docx contains an oversized or corrupt archive entry");
  }
}
