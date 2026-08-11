/**
 * ZIP central-directory inspection without decompressing entry payloads.
 * Used to reject zip bombs before PizZip / Mammoth expand the archive.
 */

export type ZipCentralEntry = {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
};

export type ZipSafetyLimits = {
  /** Max number of entries in the archive. */
  maxEntries: number;
  /** Max uncompressed size of any single entry. */
  maxEntryUncompressedBytes: number;
  /** Max sum of uncompressed sizes across all entries. */
  maxTotalUncompressedBytes: number;
  /**
   * Max uncompressed/compressed ratio when compressed size is non-zero and
   * uncompressed size exceeds `ratioMinUncompressedBytes`.
   */
  maxCompressionRatio: number;
  /** Only apply ratio check above this uncompressed size (avoids tiny-entry noise). */
  ratioMinUncompressedBytes: number;
};

/** Defaults sized for OOXML attachments (compressed upload capped separately). */
export const DEFAULT_DOCX_ZIP_SAFETY_LIMITS: ZipSafetyLimits = {
  maxEntries: 10_000,
  maxEntryUncompressedBytes: 100 * 1024 * 1024,
  maxTotalUncompressedBytes: 250 * 1024 * 1024,
  maxCompressionRatio: 100,
  ratioMinUncompressedBytes: 1 * 1024 * 1024,
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP64_MARKER = 0xffffffff;

function readUInt16LE(buffer: Buffer, offset: number): number {
  if (offset + 2 > buffer.length) {
    throw new Error("Word .docx archive is truncated");
  }
  return buffer.readUInt16LE(offset);
}

function readUInt32LE(buffer: Buffer, offset: number): number {
  if (offset + 4 > buffer.length) {
    throw new Error("Word .docx archive is truncated");
  }
  return buffer.readUInt32LE(offset);
}

/** Locate the End of Central Directory record (supports a trailing comment). */
function findEocdOffset(buffer: Buffer): number {
  const minEocdSize = 22;
  if (buffer.length < minEocdSize) {
    throw new Error("Word .docx could not be parsed");
  }
  const maxComment = Math.min(0xffff, buffer.length - minEocdSize);
  for (let commentLen = 0; commentLen <= maxComment; commentLen += 1) {
    const offset = buffer.length - minEocdSize - commentLen;
    if (readUInt32LE(buffer, offset) === EOCD_SIGNATURE) {
      const recordedComment = readUInt16LE(buffer, offset + 20);
      if (recordedComment === commentLen) return offset;
    }
  }
  throw new Error("Word .docx could not be parsed");
}

/**
 * Parse central-directory entries without inflating payloads.
 * Rejects ZIP64 archives (sizes/offsets of 0xffffffff) — not needed for typical .docx.
 */
export function listZipCentralDirectory(buffer: Buffer): ZipCentralEntry[] {
  const eocdOffset = findEocdOffset(buffer);
  const totalEntries = readUInt16LE(buffer, eocdOffset + 10);
  const centralDirOffset = readUInt32LE(buffer, eocdOffset + 16);
  if (centralDirOffset === ZIP64_MARKER || totalEntries === 0xffff) {
    throw new Error("Word .docx uses unsupported ZIP64 features");
  }

  const entries: ZipCentralEntry[] = [];
  let cursor = centralDirOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (readUInt32LE(buffer, cursor) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error("Word .docx archive is corrupted");
    }
    const compressionMethod = readUInt16LE(buffer, cursor + 10);
    const compressedSize = readUInt32LE(buffer, cursor + 20);
    const uncompressedSize = readUInt32LE(buffer, cursor + 24);
    const fileNameLength = readUInt16LE(buffer, cursor + 28);
    const extraLength = readUInt16LE(buffer, cursor + 30);
    const commentLength = readUInt16LE(buffer, cursor + 32);
    const localHeaderOffset = readUInt32LE(buffer, cursor + 42);

    if (
      compressedSize === ZIP64_MARKER ||
      uncompressedSize === ZIP64_MARKER ||
      localHeaderOffset === ZIP64_MARKER
    ) {
      throw new Error("Word .docx uses unsupported ZIP64 features");
    }

    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > buffer.length) {
      throw new Error("Word .docx archive is truncated");
    }
    const fileName = buffer.subarray(nameStart, nameEnd).toString("utf8");
    entries.push({
      fileName,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      localHeaderOffset,
    });
    cursor = nameEnd + extraLength + commentLength;
  }
  return entries;
}

export function assertZipSafetyLimits(
  entries: readonly ZipCentralEntry[],
  limits: ZipSafetyLimits = DEFAULT_DOCX_ZIP_SAFETY_LIMITS
): void {
  if (entries.length > limits.maxEntries) {
    throw new Error("Word .docx has too many archive entries");
  }

  let totalUncompressed = 0;
  for (const entry of entries) {
    if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
      throw new Error("Word .docx contains an oversized archive entry");
    }
    totalUncompressed += entry.uncompressedSize;
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      throw new Error("Word .docx uncompressed size exceeds the limit");
    }
    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize >= limits.ratioMinUncompressedBytes
    ) {
      const ratio = entry.uncompressedSize / entry.compressedSize;
      if (ratio > limits.maxCompressionRatio) {
        throw new Error("Word .docx compression ratio is suspiciously high");
      }
    }
  }
}
