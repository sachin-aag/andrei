/**
 * OCR and PDF text layers often emit a unicode minus, an en/em/figure dash,
 * or a hyphen variant as the sign, or split "- 15". A dash between two digits
 * is a range and stays as-is. A dash one space before a number may be a
 * leading minus or a bullet — that is not decided here.
 *
 * ASCII hyphen, unicode minus, en-dash, em-dash, figure dash, horizontal bar,
 * hyphen / non-breaking hyphen, small/fullwidth hyphen-minus.
 */
export const UNICODE_MINUS_SIGN_RE = /[−–—‒―‐‑﹘﹣－]/g;

/** Optional leading minus in a quantity, including OCR dash lookalikes. */
export const LEADING_MINUS_CLASS = String.raw`[\-−–—‒―‐‑﹘﹣－]`;

/** Hyphen-minus and unicode minus: these are signs, not bullets. */
export const CERTAIN_MINUS_CLASS = String.raw`[\-−]`;

const DASH_CHARS = String.raw`\-−–—‒―‐‑﹘﹣－`;
const QUANTITY_UNIT =
  String.raw`(?:°\s*C|kg\s*\/\s*cm²?|rpm\b|mbar\b|\bbar\b|%rh|%(?!\s*rh)|mm\b)`;

const SIGNED_QUANTITY_RE = new RegExp(
  `(?<![A-Za-z0-9.])${LEADING_MINUS_CLASS}\\s*(\\d+(?:\\.\\d+)?)\\s*(${QUANTITY_UNIT})?`,
  "gi"
);

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

export function glueOcrMinusSigns(text: string): string {
  const asHyphen = text.replace(UNICODE_MINUS_SIGN_RE, (ch, offset, str) => {
    const prev = str[offset - 1] ?? "";
    if (/\d/.test(prev)) return ch;
    return "-";
  });
  return asHyphen.replace(/(?<![\d.])-\s+(\d)/g, "-$1");
}

type SignedQuantity = {
  magnitude: string;
  unit: string;
};

function parseSignedQuantities(text: string): SignedQuantity[] {
  const signed: SignedQuantity[] = [];
  for (const match of glueOcrMinusSigns(text).matchAll(SIGNED_QUANTITY_RE)) {
    if (!match[1]) continue;
    signed.push({
      magnitude: match[1],
      unit: (match[2] ?? "").replace(/\s+/g, ""),
    });
  }
  return signed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unitPattern(unit: string): string {
  if (!unit) return QUANTITY_UNIT;
  if (unit.startsWith("°")) return String.raw`°\s*C`;
  return escapeRegExp(unit);
}

/**
 * Copy a leading minus onto an unsigned (or dash-then-space) quantity in
 * `base` only when `evidence` already shows `-N` with the same unit. Never
 * invent a sign. An en-dash range (`15–130 °C`) is not a signed quantity.
 */
export function overlayLeadingMinuses(base: string, evidence: string): string {
  const signed = parseSignedQuantities(evidence);
  let next = glueImmediateMinusSigns(base);
  if (signed.length === 0) return next;
  for (const quantity of signed) {
    next = overlayOneQuantity(next, quantity);
  }
  return next;
}

function overlayOneQuantity(text: string, quantity: SignedQuantity): string {
  const unit = unitPattern(quantity.unit);
  const magnitude = escapeRegExp(quantity.magnitude);
  const unsigned = new RegExp(
    `(?<![A-Za-z0-9.${DASH_CHARS}])(?:${LEADING_MINUS_CLASS}\\s+)?(${magnitude})(\\s*${unit})`,
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

export function hasUnsignedMagnitude(text: string, magnitude: string): boolean {
  if (!magnitude) return false;
  const hay = glueImmediateMinusSigns(text);
  const re = new RegExp(
    `(?<![A-Za-z0-9.${DASH_CHARS}])${escapeRegExp(magnitude)}(?!\\d)(?![${DASH_CHARS}]\\d)`,
    "g"
  );
  return re.test(hay);
}

export function pageNeedsNumericSignLook(
  text: string,
  ambiguousMagnitudes: readonly string[] = []
): boolean {
  if (hasAmbiguousNumericDash(text)) return true;
  return ambiguousMagnitudes.some((magnitude) =>
    hasUnsignedMagnitude(text, magnitude)
  );
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
