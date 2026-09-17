import {
  ELR_RECOMMENDATION_LABELS,
  ELR_RECOMMENDATIONS,
  ELR_RISK_GRADE_LABELS,
  ELR_RISK_GRADES,
  type ElrRecommendation,
  type ElrRiskGrade,
} from "./sections";

function fold(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/[.,:;!?()[\]"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const GRADE_ALIASES: Record<string, (typeof ELR_RISK_GRADES)[number]> = {
  low: "low",
  "low risk": "low",
  medium: "medium",
  "medium risk": "medium",
  high: "high",
  "high risk": "high",
};

const RECOMMENDATION_ALIASES: Record<
  string,
  (typeof ELR_RECOMMENDATIONS)[number]
> = {
  continue: "continue",
  "continue routine use": "continue",
  "continue routine use no action required": "continue",
  "continue routine manufacturing": "continue",
  "no action required": "continue",
  "no action": "continue",
  early_requalification: "early_requalification",
  "early requalification": "early_requalification",
  "early re qualification": "early_requalification",
  "early re qualification required": "early_requalification",
  capa: "capa",
  "capa required": "capa",
  other: "other",
  "other specify": "other",
};

for (const [key, label] of Object.entries(ELR_RISK_GRADE_LABELS)) {
  GRADE_ALIASES[fold(label)] = key as (typeof ELR_RISK_GRADES)[number];
}
for (const [key, label] of Object.entries(ELR_RECOMMENDATION_LABELS)) {
  RECOMMENDATION_ALIASES[fold(label)] =
    key as (typeof ELR_RECOMMENDATIONS)[number];
}

function invalidEnumMessage(field: string, allowed: readonly string[]): string {
  return `'${field}' must be one of ${allowed.join(" | ")} (not free text).`;
}

function coerceFromAliases<T extends string>(
  markdown: string,
  aliases: Record<string, T>,
  allowed: readonly T[],
  field: string
): { ok: true; value: T } | { ok: false; message: string } {
  const key = fold(markdown);
  const value = aliases[key];
  if (value) return { ok: true, value };
  return { ok: false, message: invalidEnumMessage(field, allowed) };
}

/**
 * MJ ELR `overallGrade` / `recommendation` are stored enums. Chat often
 * drafts the UI label ("Low risk", "Continue routine manufacturing").
 * Returns null when the field is not one of those enums.
 */
export function coerceElrEnumDraft(
  section: string,
  targetField: string,
  markdown: string
):
  | { ok: true; value: ElrRiskGrade | ElrRecommendation }
  | { ok: false; message: string }
  | null {
  if (section === "elr_risk_actions" && targetField === "overallGrade") {
    return coerceFromAliases(
      markdown,
      GRADE_ALIASES,
      ELR_RISK_GRADES,
      "overallGrade"
    );
  }
  if (section === "elr_conclusion" && targetField === "recommendation") {
    return coerceFromAliases(
      markdown,
      RECOMMENDATION_ALIASES,
      ELR_RECOMMENDATIONS,
      "recommendation"
    );
  }
  return null;
}
