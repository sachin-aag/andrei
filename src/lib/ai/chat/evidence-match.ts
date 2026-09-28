import uFuzzy from "@leeoniya/ufuzzy";
import type { HardFact, HardFactKind } from "@/lib/ai/chat/claim-facts";
import {
  glueOcrMinusSigns,
  glueOcrUrsIds,
} from "@/lib/attachments/numeric-signs";

const fuzzy = new uFuzzy({
  intraMode: 1,
  intraIns: 1,
  intraSub: 1,
  intraDel: 1,
  intraTrn: 1,
});

function collapseWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function latinize(text: string): string {
  try {
    return uFuzzy.latinize(text);
  } catch {
    return text;
  }
}

export function normalizeHaystack(text: string): string {
  return latinize(collapseWs(text)).toLowerCase();
}

/** OCR often splits 3.5 into "3 . 5" / "3. 5". Do not glue "070. 5 units". */
function glueOcrDecimals(text: string): string {
  const dotted = text.replace(/[·•․．｡]/g, ".");
  return dotted
    .replace(/(?<![\d.])(\d{1,4})\s*\.\s+(\d{1,4})(?!\d)/g, "$1.$2")
    .replace(/(?<![\d.])(\d{1,4})\s+\.\s*(\d{1,4})(?!\d)/g, "$1.$2");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numericForms(fact: HardFact): string[] {
  const raw = fact.text.replace(/,/g, "");
  const compact = glueOcrMinusSigns(
    raw.replace(/\s+/g, "").replace(/°/g, "").toLowerCase()
  );
  const forms = new Set<string>([
    compact,
    glueOcrMinusSigns(fact.normalized),
  ]);
  const re = /[-−–]?\d+(?:\.\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(compact))) {
    const before = compact.slice(0, match.index);
    // The window after ± is not independent evidence for the setpoint
    // (−50 ± 10 RPM must not verify a draft of 50 ± 10 RPM via the 10).
    if (/[±]|(\+\/-)|(\+-)|(plus\/minus)$/i.test(before)) {
      continue;
    }
    // "to 150" in −20 °C to 150 °C must not verify a draft of 20 °C.
    if (/to$/i.test(before)) {
      continue;
    }
    const token = glueOcrMinusSigns(match[0]);
    const prev = compact[match.index - 1] ?? "";
    // A dash after a digit is a range separator (15–130), not a sign and
    // not independent evidence for the first number's sign.
    if (token.startsWith("-") && /\d/.test(prev)) {
      continue;
    }
    forms.add(token);
  }
  return [...forms].filter(Boolean);
}

function isNegativeSignBefore(haystack: string, index: number): boolean {
  return /(?<![\d.])[-−–]\s*$/.test(haystack.slice(0, index));
}

function hasSignedMatch(
  haystack: string,
  re: RegExp,
  wantNegative: boolean
): boolean {
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(haystack))) {
    if (isNegativeSignBefore(haystack, match.index) === wantNegative) {
      return true;
    }
    if (match[0].length === 0) break;
  }
  return false;
}

/**
 * Integers and decimals must be whole tokens. Substring "0" inside E/PR/070,
 * "1.0 Purpose", or "2024" is not evidence for contaminated-units 0. A
 * sentence-final "0." still matches — only `.` + digit is a decimal.
 * OCR-split "3 . 5" / "3. 5" is evidence for 3.5, not for integer 3.
 * A leading minus is part of the number: 15 °C is not evidence for −15 °C.
 * The high end of a range (150 in −20 to 150 °C) is not evidence for 20 °C.
 */
function numericNeedlePresent(haystack: string, needle: string): boolean {
  const n = glueOcrMinusSigns(needle.toLowerCase());
  if (!n) return false;
  const parsed = /^(-)?(\d+(?:\.\d+)?)(.*)$/.exec(n);
  if (!parsed) {
    return haystack.includes(n);
  }
  const wantNegative = Boolean(parsed[1]);
  const digits = parsed[2]!;
  if (/^\d+\.\d+$/.test(digits)) {
    const [whole, frac] = digits.split(".");
    return hasSignedMatch(
      haystack,
      new RegExp(
        `(?<![\\d.])${escapeRegExp(whole!)}\\s*\\.\\s*${escapeRegExp(frac!)}(?!\\d)(?!\\.\\d)`,
        "gi"
      ),
      wantNegative
    );
  }
  if (/^\d+$/.test(digits)) {
    return hasSignedMatch(
      haystack,
      new RegExp(
        `(?<![\\d.])${escapeRegExp(digits)}(?!\\d)(?!\\s*\\.\\s*\\d)`,
        "gi"
      ),
      wantNegative
    );
  }
  if (haystack.includes(n)) return true;
  const spaced = n.replace(/(\d)([a-z%])/gi, "$1 $2");
  return spaced !== n && haystack.includes(spaced);
}

function dateNeedles(fact: HardFact): string[] {
  const t = fact.text.trim();
  const forms = new Set<string>([normalizeHaystack(t), fact.normalized]);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) {
    forms.add(`${iso[3]}/${iso[2]}/${iso[1]}`);
    forms.add(`${iso[3]}-${iso[2]}-${iso[1]}`);
  }
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(t);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    forms.add(`${dmy[1]}/${dmy[2]}/${year}`);
    forms.add(`${year}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`);
  }
  return [...forms].filter(Boolean);
}

function identifierNeedles(fact: HardFact): string[] {
  const upper = fact.text.replace(/\s+/g, "").toUpperCase();
  return [upper, fact.normalized, collapseWs(fact.text).toUpperCase()];
}

function includesNormalized(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.includes(needle);
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (needle.length < 4) return false;
  const idxs = fuzzy.filter([haystack], needle);
  return Boolean(idxs && idxs.length > 0);
}

function kindNeedles(fact: HardFact): string[] {
  switch (fact.kind) {
    case "number":
    case "duration":
    case "temperature":
      return numericForms(fact);
    case "date":
      return dateNeedles(fact);
    case "identifier":
      return identifierNeedles(fact);
    default: {
      const exhaustive: never = fact.kind;
      return exhaustive;
    }
  }
}

function kindAllowsFuzzy(kind: HardFactKind): boolean {
  return kind === "identifier" || kind === "date";
}

/**
 * True when the served page text supports this hard fact.
 * Numbers match after comma/space normalization and OCR-split decimals
 * (`3 . 5` → 3.5). OCR `[9]`/`[g]` via uFuzzy on identifiers.
 * Empty haystack never matches.
 */
export function evidenceContainsFact(haystack: string, fact: HardFact): boolean {
  if (!haystack.trim()) return false;
  const hay = normalizeHaystack(haystack);
  const originalHay = collapseWs(haystack).toUpperCase();
  const ursHay = glueOcrUrsIds(originalHay);
  const ursNormalized = glueOcrUrsIds(hay);
  // URS-1 / URS-15 are identifiers. Their digits are not a measured
  // "1 mm" or "15 °C" sitting in that row's requirement text.
  const numericHay = glueOcrMinusSigns(
    glueOcrDecimals(
      ursNormalized
        .replace(/°/g, "")
        .replace(/,/g, "")
        .replace(/\burs-\d+\b/gi, " ")
        .replace(/\s+/g, " ")
    )
  );
  for (const needle of kindNeedles(fact)) {
    if (!needle) continue;
    if (fact.kind === "identifier") {
      if (ursHay.includes(needle.toUpperCase())) return true;
      if (includesNormalized(ursNormalized, needle.toLowerCase())) return true;
      continue;
    }
    if (
      fact.kind === "number" ||
      fact.kind === "duration" ||
      fact.kind === "temperature"
    ) {
      if (numericNeedlePresent(numericHay, needle)) return true;
      continue;
    }
    if (includesNormalized(hay, needle.toLowerCase())) return true;
  }
  if (kindAllowsFuzzy(fact.kind)) {
    return fuzzyMatch(hay, normalizeHaystack(fact.text));
  }
  return false;
}
