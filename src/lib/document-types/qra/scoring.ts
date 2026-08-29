/**
 * SOP/DP/QA/010 R04 scoring. Pure functions only.
 * Citations: docs/sop-010-r04-transcription.md (pp. 11–15, 34–35).
 */

export type RiskBand = "low" | "medium" | "high";
export type QualitativeLevel = "low" | "medium" | "high";
export type AssessmentMode = "qualitative" | "quantitative";

/** Allowed numeric levels (Table 04, pp. 13–14). */
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/** Table 06 p. 15 — inclusive bounds. */
export const RPN_LOW_MAX = 8;
export const RPN_MEDIUM_MAX = 24;
export const RPN_HIGH_MAX = 125;

export const RISK_BAND_LABEL: Record<RiskBand, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const QUANTITATIVE_RUBRIC = [
  {
    score: 1,
    severity: "No impact",
    probability: "Infrequently, yearly, or more than a year",
    detectability: "Very high / complete detection possible",
  },
  {
    score: 2,
    severity: "Low impact (may have indirect impact)",
    probability: "Low frequency e.g. half-yearly",
    detectability: "High possibility of detection",
  },
  {
    score: 3,
    severity: "Medium or moderate impact (will have indirect impact)",
    probability: "Moderate frequency e.g. quarterly",
    detectability: "Medium or moderate possibility of detection",
  },
  {
    score: 4,
    severity: "High impact (may have direct impact)",
    probability: "Repeated e.g. weekly",
    detectability: "Low possibility of detection",
  },
  {
    score: 5,
    severity: "Very high impact (will have direct impact)",
    probability: "Regularly, more than one occurrence per day",
    detectability: "No detection possible",
  },
] as const;

export const QUALITATIVE_RUBRIC: Record<
  QualitativeLevel,
  { severity: string; probability: string; detectability: string }
> = {
  low: {
    severity: "No impact or low impact (may have indirect impact)",
    probability: "Infrequently, yearly, or one occurrence more than a year",
    detectability: "Very high / complete detection possible",
  },
  medium: {
    severity: "Medium or moderate impact (will have indirect impact)",
    probability: "Half-yearly or quarterly",
    detectability: "Medium or moderate possibility of detection",
  },
  high: {
    severity: "High impact (having direct impact)",
    probability: "Regularly, more than one occurrence weekly or per day",
    detectability: "No detection possible",
  },
};

/** Table 02 p. 12 — key is `${severity}|${probability}|${detectability}`. */
const RPR_LOOKUP: Record<string, RiskBand> = {
  "high|high|high": "high",
  "high|high|medium": "high",
  "high|high|low": "high",
  "high|medium|high": "high",
  "high|medium|medium": "high",
  "high|medium|low": "medium",
  "high|low|high": "high",
  "high|low|medium": "medium",
  "high|low|low": "low",
  "medium|high|high": "high",
  "medium|high|medium": "high",
  "medium|high|low": "medium",
  "medium|medium|high": "high",
  "medium|medium|medium": "high",
  "medium|medium|low": "medium",
  "medium|low|high": "medium",
  "medium|low|medium": "medium",
  "medium|low|low": "low",
  "low|high|high": "high",
  "low|high|medium": "medium",
  "low|high|low": "low",
  "low|medium|high": "medium",
  "low|medium|medium": "medium",
  "low|medium|low": "low",
  "low|low|high": "low",
  "low|low|medium": "low",
  "low|low|low": "low",
};

export function isScore(value: number): boolean {
  return Number.isInteger(value) && value >= SCORE_MIN && value <= SCORE_MAX;
}

export function computeRpn(
  severity: number,
  probability: number,
  detectability: number
): number {
  if (!isScore(severity) || !isScore(probability) || !isScore(detectability)) {
    throw new Error("S, P and D must be integers from 1 to 5");
  }
  return severity * probability * detectability;
}

export function rpnBand(rpn: number): RiskBand {
  if (rpn < SCORE_MIN || rpn > RPN_HIGH_MAX) {
    throw new Error(`RPN ${rpn} is outside 1–${RPN_HIGH_MAX}`);
  }
  if (rpn <= RPN_LOW_MAX) return "low";
  if (rpn <= RPN_MEDIUM_MAX) return "medium";
  return "high";
}

export function rprBand(
  severity: QualitativeLevel,
  probability: QualitativeLevel,
  detectability: QualitativeLevel
): RiskBand {
  const key = `${severity}|${probability}|${detectability}`;
  const band = RPR_LOOKUP[key];
  if (!band) {
    throw new Error(`No RPR entry for ${key}`);
  }
  return band;
}

export function parseScore(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return isScore(n) ? n : null;
}

const LEVEL_ALIASES: Record<string, QualitativeLevel> = {
  low: "low",
  l: "low",
  medium: "medium",
  med: "medium",
  m: "medium",
  moderate: "medium",
  high: "high",
  h: "high",
};

export function parseLevel(raw: string): QualitativeLevel | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return LEVEL_ALIASES[key] ?? null;
}

export type A02Answers = {
  impactKnown: boolean;
  scopeDefined: boolean;
  scopeNarrow: boolean;
};

/** F01 p. 26 / A02 p. 23: yes to all → qualitative; no to any → quantitative. */
export function selectAssessmentMode(answers: A02Answers): AssessmentMode {
  return answers.impactKnown && answers.scopeDefined && answers.scopeNarrow
    ? "qualitative"
    : "quantitative";
}

export function parseYesNo(raw: string): boolean | null {
  const key = raw.trim().toLowerCase();
  if (key === "yes" || key === "y" || key === "true") return true;
  if (key === "no" || key === "n" || key === "false") return false;
  return null;
}

export function mitigationRequired(band: RiskBand): boolean {
  return band !== "low";
}

export function treatBeforeProceeding(band: RiskBand): boolean {
  return band === "high";
}

/** Initial risk is acceptable only when Low (7.4.4). */
export function initialRiskAcceptable(band: RiskBand): boolean {
  return band === "low";
}

/**
 * After mitigation: Low is acceptable; Medium may be accepted (Table 03 R02
 * wording); High is not.
 */
export function residualRiskAcceptable(band: RiskBand): boolean {
  return band !== "high";
}

export function formatComputedScore(
  mode: AssessmentMode,
  band: RiskBand,
  rpn?: number
): string {
  if (mode === "quantitative") {
    return rpn == null
      ? RISK_BAND_LABEL[band]
      : `${rpn} (${RISK_BAND_LABEL[band]})`;
  }
  return RISK_BAND_LABEL[band];
}

export function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export const RPR_COMBINATIONS: ReadonlyArray<{
  severity: QualitativeLevel;
  probability: QualitativeLevel;
  detectability: QualitativeLevel;
  band: RiskBand;
}> = (["high", "medium", "low"] as const).flatMap((severity) =>
  (["high", "medium", "low"] as const).flatMap((probability) =>
    (["high", "medium", "low"] as const).map((detectability) => ({
      severity,
      probability,
      detectability,
      band: rprBand(severity, probability, detectability),
    }))
  )
);
