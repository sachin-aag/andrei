/**
 * OCR and PDF text layers often emit a unicode minus (U+2212) or an en-dash
 * as the sign, or split "- 15". A dash between two digits is a range and
 * stays as-is.
 */
export function glueOcrMinusSigns(text: string): string {
  const asHyphen = text.replace(/[−–]/g, (ch, offset, str) => {
    const prev = str[offset - 1] ?? "";
    if (/\d/.test(prev)) return ch;
    return "-";
  });
  return asHyphen.replace(/(?<![\d.])-\s+(\d)/g, "-$1");
}

/**
 * Table/footer wrap often splits `URS-33` into `URS- 33`, `URS-\n33`, or
 * `URS - 33`. Keep the original `URS` casing. Idempotent on a clean ID.
 */
export function glueOcrUrsIds(text: string): string {
  return glueOcrMinusSigns(text).replace(
    /\b(URS)\s*-\s*(\d+)\b/gi,
    "$1-$2"
  );
}
