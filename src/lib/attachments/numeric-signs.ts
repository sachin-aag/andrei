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

const DASH_CHARS = String.raw`\-−–—‒―‐‑﹘﹣－`;
const CELSIUS_UNIT = String.raw`°\s*C`;
const UNSIGNED_CELSIUS_RE = new RegExp(
  `(?<![A-Za-z0-9.${DASH_CHARS}])(\\d+(?:\\.\\d+)?)(\\s*${CELSIUS_UNIT})\\b`,
  "gi"
);
const SIGNED_CELSIUS_RE = new RegExp(
  `(?<![A-Za-z0-9.])${LEADING_MINUS_CLASS}\\s*(\\d+(?:\\.\\d+)?)\\s*${CELSIUS_UNIT}\\b`,
  "gi"
);
const UNSIGNED_CELSIUS_TO_RE = new RegExp(
  `(?<![A-Za-z0-9.${DASH_CHARS}])(\\d+(?:\\.\\d+)?)\\s*${CELSIUS_UNIT}\\s+to\\b`,
  "gi"
);

export function glueOcrMinusSigns(text: string): string {
  const asHyphen = text.replace(UNICODE_MINUS_SIGN_RE, (ch, offset, str) => {
    const prev = str[offset - 1] ?? "";
    if (/\d/.test(prev)) return ch;
    return "-";
  });
  return asHyphen.replace(/(?<![\d.])-\s+(\d)/g, "-$1");
}

function signedCelsiusMagnitudes(text: string): Set<string> {
  const magnitudes = new Set<string>();
  for (const match of text.matchAll(SIGNED_CELSIUS_RE)) {
    if (match[1]) magnitudes.add(match[1]);
  }
  return magnitudes;
}

/**
 * Copy a leading minus onto unsigned `N °C` in `base` only when `evidence`
 * already shows `-N °C`. Never invent a sign. An en-dash range (`15–130 °C`)
 * is not `N °C` and stays unsigned (URS-37).
 */
export function overlayLeadingMinuses(base: string, evidence: string): string {
  const gluedBase = glueOcrMinusSigns(base);
  const signed = signedCelsiusMagnitudes(glueOcrMinusSigns(evidence));
  if (signed.size === 0) return gluedBase;
  return gluedBase.replace(UNSIGNED_CELSIUS_RE, (full, magnitude: string) =>
    signed.has(magnitude) ? `-${full}` : full
  );
}

/**
 * True when the page still has an unsigned `N °C to` range whose magnitude is
 * not already signed on that page. That is the URS-3/URS-5 dropped-minus
 * form; genuine URS-37 `15–130 °C` (en-dash, no "to") does not match.
 */
export function textLayerDroppedCelsiusSign(text: string): boolean {
  const glued = glueOcrMinusSigns(text);
  const signed = signedCelsiusMagnitudes(glued);
  for (const match of glued.matchAll(UNSIGNED_CELSIUS_TO_RE)) {
    if (match[1] && !signed.has(match[1])) return true;
  }
  return false;
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
