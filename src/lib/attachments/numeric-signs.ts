/**
 * OCR and PDF text layers often emit a unicode minus, an en/em/figure dash,
 * or a hyphen variant as the sign, or split "- 15". A dash between two digits
 * is a range and stays as-is.
 *
 * ASCII hyphen, unicode minus, en-dash, em-dash, figure dash, horizontal bar,
 * hyphen / non-breaking hyphen, small/fullwidth hyphen-minus.
 */
export const UNICODE_MINUS_SIGN_RE = /[−–—‒―‐‑﹘﹣－]/g;

/** Optional leading minus in a quantity, including OCR dash lookalikes. */
export const LEADING_MINUS_CLASS = String.raw`[\-−–—‒―‐‑﹘﹣－]`;

export function glueOcrMinusSigns(text: string): string {
  const asHyphen = text.replace(UNICODE_MINUS_SIGN_RE, (ch, offset, str) => {
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
