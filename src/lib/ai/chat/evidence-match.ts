import uFuzzy from "@leeoniya/ufuzzy";
import type { HardFact, HardFactKind } from "@/lib/ai/chat/claim-facts";

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numericForms(fact: HardFact): string[] {
  const raw = fact.text.replace(/,/g, "");
  const compact = raw.replace(/\s+/g, "").replace(/°/g, "").toLowerCase();
  const forms = new Set<string>([compact, fact.normalized]);
  for (const token of compact.match(/\d+(?:\.\d+)?/g) ?? []) {
    forms.add(token);
  }
  return [...forms].filter(Boolean);
}

/**
 * Integers and decimals must be whole tokens. Substring "0" inside E/PR/070,
 * "1.0 Purpose", or "2024" is not evidence for contaminated-units 0. A
 * sentence-final "0." still matches — only `.` + digit is a decimal.
 */
function numericNeedlePresent(haystack: string, needle: string): boolean {
  const n = needle.toLowerCase();
  if (!n) return false;
  if (/^\d+(?:\.\d+)?$/.test(n)) {
    return new RegExp(
      `(?<![\\d.])${escapeRegExp(n)}(?!\\d)(?!\\.\\d)`,
      "i"
    ).test(haystack);
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
 * Numbers match after comma/space normalization (OCR `[9]`/`[g]` via uFuzzy
 * on identifiers). Empty haystack never matches.
 */
export function evidenceContainsFact(haystack: string, fact: HardFact): boolean {
  if (!haystack.trim()) return false;
  const hay = normalizeHaystack(haystack);
  const originalHay = collapseWs(haystack).toUpperCase();
  // URS-1 / URS-15 are identifiers. Their digits are not a measured
  // "1 mm" or "15 °C" sitting in that row's requirement text.
  const numericHay = hay
    .replace(/°/g, "")
    .replace(/,/g, "")
    .replace(/\burs-\d+\b/gi, " ")
    .replace(/\s+/g, " ");
  for (const needle of kindNeedles(fact)) {
    if (!needle) continue;
    if (fact.kind === "identifier") {
      if (originalHay.includes(needle.toUpperCase())) return true;
      if (includesNormalized(hay, needle.toLowerCase())) return true;
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
