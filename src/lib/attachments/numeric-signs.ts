/**
 * OCR and PDF text layers often emit a unicode minus (U+2212) or an en-dash
 * as the sign, or split "- 15". A dash between two digits is a range and
 * stays as-is.
 *
 * ASCII hyphen, unicode minus, en-dash, em-dash, figure dash, horizontal bar,
 * hyphen / non-breaking hyphen, small/fullwidth hyphen-minus.
 */
export const UNICODE_MINUS_SIGN_RE = /[−–—‒―‐‑﹘﹣－]/g;

/** Optional leading minus in a quantity, including OCR dash lookalikes. */
export const LEADING_MINUS_CLASS = String.raw`[\-−–—‒―‐‑﹘﹣－]`;

const DASH_CHARS = String.raw`\-−–—‒―‐‑﹘﹣－`;
const APPROX_CHARS = String.raw`~≈`;
const TEMPERATURE_UNIT = String.raw`(?:°\s*C)`;

const SIGNED_TEMPERATURE_RE = new RegExp(
  `(?<![A-Za-z0-9.])${LEADING_MINUS_CLASS}\\s*(\\d+(?:\\.\\d+)?)\\s*(${TEMPERATURE_UNIT})`,
  "gi"
);

export function glueOcrMinusSigns(text: string): string {
  const asHyphen = text.replace(/[−–]/g, (ch, offset, str) => {
    const prev = str[offset - 1] ?? "";
    if (/\d/.test(prev)) return ch;
    return "-";
  });
  return asHyphen.replace(/(?<![\d.])-\s+(\d)/g, "-$1");
}

/**
 * Convert a minus-like glyph that sits immediately before a digit into `-`.
 * Leave a dash that is one space away from the number — that may be a bullet.
 * A dash between two digits stays a range.
 */
export function glueImmediateMinusSigns(text: string): string {
  return text.replace(UNICODE_MINUS_SIGN_RE, (ch, offset, str) => {
    const prev = str[offset - 1] ?? "";
    const next = str[offset + 1] ?? "";
    if (/\d/.test(prev)) return ch;
    if (/\s/.test(next)) return ch;
    if (/\d/.test(next)) return "-";
    return ch;
  });
}

type SignedTemperature = {
  magnitude: string;
};

function parseSignedTemperatures(text: string): SignedTemperature[] {
  const signed: SignedTemperature[] = [];
  for (const match of glueOcrMinusSigns(text).matchAll(SIGNED_TEMPERATURE_RE)) {
    if (!match[1]) continue;
    signed.push({ magnitude: match[1] });
  }
  return signed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Copy a leading minus onto an unsigned (or dash-then-space) Celsius quantity
 * in `base` only when `evidence` already shows `-N °C`. Never invent a sign.
 * An en-dash range (`15–130 °C`) is not a signed quantity. A leading tilde or
 * ≈ is approximate, not a dropped minus — do not rewrite `~50±10 RPM`.
 */
export function overlayLeadingMinuses(base: string, evidence: string): string {
  const signed = parseSignedTemperatures(evidence);
  let next = glueImmediateMinusSigns(base);
  if (signed.length === 0) return next;
  for (const quantity of signed) {
    next = overlayOneTemperature(next, quantity);
  }
  return next;
}

function overlayOneTemperature(
  text: string,
  quantity: SignedTemperature
): string {
  const magnitude = escapeRegExp(quantity.magnitude);
  const unsigned = new RegExp(
    `(?<![A-Za-z0-9.${DASH_CHARS}${APPROX_CHARS}])(?:${LEADING_MINUS_CLASS}\\s+)?(${magnitude})(\\s*${TEMPERATURE_UNIT})`,
    "gi"
  );
  return text.replace(unsigned, (_full, mag: string, unitText: string) => {
    return `-${mag}${unitText}`;
  });
}

/**
 * True when a hyphen/dash sits one space before a number and is not a range
 * separator (`15 – 130`) or an identifier wrap (`URS- 3`). That glyph may be
 * a leading minus or a bullet.
 */
export function hasAmbiguousNumericDash(text: string): boolean {
  const hay = glueImmediateMinusSigns(text);
  const re = new RegExp(`${LEADING_MINUS_CLASS}\\s+\\d`, "g");
  for (const match of hay.matchAll(re)) {
    const index = match.index ?? 0;
    const immediatePrev = hay[index - 1] ?? "";
    if (/[A-Za-z]/.test(immediatePrev)) continue;
    const prev = previousNonSpace(hay, index);
    if (/\d/.test(prev)) continue;
    return true;
  }
  return false;
}

function previousNonSpace(text: string, index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i]!;
    if (!/\s/.test(ch)) return ch;
  }
  return "";
}

/**
 * A `N unit to M unit` Celsius range whose left bound has no leading minus.
 * Live URS pages drop a drawn minus so the text is `15 °C to 130 °C`. Overlay
 * looks at the page image; it still does not invent a sign.
 */
export function unsignedQuantityRangeCount(text: string): number {
  const hay = glueImmediateMinusSigns(text);
  const rangeRe = new RegExp(
    `(?<![A-Za-z0-9.${DASH_CHARS}])(\\d+(?:\\.\\d+)?)(\\s*${TEMPERATURE_UNIT})?\\s+to\\s+(\\d+(?:\\.\\d+)?)(\\s*${TEMPERATURE_UNIT})?`,
    "gi"
  );
  let count = 0;
  for (const match of hay.matchAll(rangeRe)) {
    if (!match[2] && !match[4]) continue;
    count += 1;
  }
  return count;
}

export function numericSignLookScore(text: string): number {
  const leftover = hasAmbiguousNumericDash(text) ? 1 : 0;
  return leftover + unsignedQuantityRangeCount(text);
}

export function pageNeedsNumericSignLook(text: string): boolean {
  return numericSignLookScore(text) > 0;
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
