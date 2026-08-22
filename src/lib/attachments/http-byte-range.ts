/**
 * Single-range `Range` parsing for PDF preview. pdf.js sends regular ranges
 * (`bytes=0-65535`) and suffix ranges (`bytes=-65536`) for the xref table.
 */

export type ObjectByteRange = {
  start: number;
  end: number;
};

export type ParsedByteRange =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/i;

export function parseByteRangeHeader(
  header: string | null,
  sizeBytes: number
): ParsedByteRange {
  if (!header || sizeBytes <= 0) return { kind: "full" };
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) return { kind: "full" };

  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  if (rawStart === "" && rawEnd === "") return { kind: "full" };

  if (rawStart === "") {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return { kind: "unsatisfiable" };
    }
    if (suffixLength >= sizeBytes) {
      return { kind: "partial", start: 0, end: sizeBytes - 1 };
    }
    return {
      kind: "partial",
      start: sizeBytes - suffixLength,
      end: sizeBytes - 1,
    };
  }

  const start = Number(rawStart);
  if (!Number.isInteger(start) || start < 0 || start >= sizeBytes) {
    return { kind: "unsatisfiable" };
  }

  if (rawEnd === "") {
    return { kind: "partial", start, end: sizeBytes - 1 };
  }

  const end = Number(rawEnd);
  if (!Number.isInteger(end) || end < start) {
    return { kind: "unsatisfiable" };
  }
  return { kind: "partial", start, end: Math.min(end, sizeBytes - 1) };
}

export function contentRangeHeader(
  range: ObjectByteRange,
  sizeBytes: number
): string {
  return `bytes ${range.start}-${range.end}/${sizeBytes}`;
}

export function rangeContentLength(range: ObjectByteRange): number {
  return range.end - range.start + 1;
}
