import { normalizeRichField, richJsonToPlainText } from "@/lib/tiptap/rich-text";

export const ANALYZE_METHODS = ["sixM", "fiveWhy", "brainstorming"] as const;
export type AnalyzeMethod = (typeof ANALYZE_METHODS)[number];

/** Legacy two-way tool type kept for evaluate-run-helpers callers. */
export type AnalyzeTool = "sixM" | "fiveWhy";

export const ANALYZE_METHOD_LABELS: Record<AnalyzeMethod, string> = {
  sixM: "6M",
  fiveWhy: "5-Why",
  brainstorming: "Brainstorming",
};

export const ANALYZE_METHOD_FIELDS: Record<AnalyzeMethod, readonly string[]> = {
  sixM: [
    "sixM.man",
    "sixM.machine",
    "sixM.measurement",
    "sixM.material",
    "sixM.method",
    "sixM.milieu",
    "sixM.conclusion",
  ],
  fiveWhy: ["fiveWhy.narrative"],
  brainstorming: ["brainstorming"],
};

/** Always-drafted Analyze fields, regardless of chosen root-cause method. */
export const ANALYZE_ALWAYS_FIELDS = [
  "investigationOutcome",
  "rootCause.narrative",
  "impactAssessment",
] as const;

export function meaningfulAnalyzeText(value: unknown): boolean {
  const text =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "type" in value
        ? richJsonToPlainText(normalizeRichField(value))
        : "";
  const normalized = text.trim().toLowerCase().replace(/\.+$/, "");
  return (
    normalized.length > 0 &&
    normalized !== "not applicable" &&
    normalized !== "n/a"
  );
}

function hasSixMContent(content: {
  sixM?: Record<string, unknown>;
}): boolean {
  return content.sixM
    ? Object.values(content.sixM).some(meaningfulAnalyzeText)
    : false;
}

function hasFiveWhyContent(content: {
  fiveWhy?: Record<string, unknown>;
}): boolean {
  return content.fiveWhy
    ? [content.fiveWhy.narrative, content.fiveWhy.conclusion].some(
        meaningfulAnalyzeText
      )
    : false;
}

function hasBrainstormingContent(content: {
  brainstorming?: unknown;
}): boolean {
  return meaningfulAnalyzeText(content.brainstorming);
}

/**
 * Detect which single Analyze root-cause method the section content uses.
 * Returns null when none or more than one method has meaningful content.
 */
export function detectAnalyzeMethod(content: unknown): AnalyzeMethod | null {
  if (!content || typeof content !== "object") return null;
  const c = content as {
    sixM?: Record<string, unknown>;
    fiveWhy?: Record<string, unknown>;
    brainstorming?: unknown;
  };

  const found: AnalyzeMethod[] = [];
  if (hasSixMContent(c)) found.push("sixM");
  if (hasFiveWhyContent(c)) found.push("fiveWhy");
  if (hasBrainstormingContent(c)) found.push("brainstorming");

  return found.length === 1 ? found[0]! : null;
}

/**
 * Two-way helper for eval callers that only care about 6M vs 5-Why.
 * Brainstorming-only content returns null (handled separately by
 * normalizeAnalyzeToolResults).
 */
export function existingAnalyzeTool(content: unknown): AnalyzeTool | null {
  const method = detectAnalyzeMethod(content);
  if (method === "sixM" || method === "fiveWhy") return method;
  return null;
}

export type AnalyzeMethodPlan = {
  draftFields: readonly string[];
  notApplicableFields: readonly string[];
};

/**
 * Field partition for drafting after a method is selected:
 * draft the chosen method's fields; mark the other methods' fields N/A.
 */
export function analyzeMethodPlan(method: AnalyzeMethod): AnalyzeMethodPlan {
  const draftFields = ANALYZE_METHOD_FIELDS[method];
  const notApplicableFields = ANALYZE_METHODS.filter((m) => m !== method).flatMap(
    (m) => ANALYZE_METHOD_FIELDS[m]
  );
  return { draftFields, notApplicableFields };
}

/** Build the report.toolsUsed object with exactly one method checked. */
export function toolsUsedForMethod(method: AnalyzeMethod): {
  sixM: boolean;
  fiveWhy: boolean;
  brainstorming: boolean;
} {
  return {
    sixM: method === "sixM",
    fiveWhy: method === "fiveWhy",
    brainstorming: method === "brainstorming",
  };
}

/** Label of the method checked in report header toolsUsed, if any single one. */
export function methodFromToolsUsed(
  toolsUsed: { sixM?: boolean; fiveWhy?: boolean; brainstorming?: boolean } | null | undefined
): AnalyzeMethod | null {
  if (!toolsUsed) return null;
  const checked: AnalyzeMethod[] = [];
  if (toolsUsed.sixM) checked.push("sixM");
  if (toolsUsed.fiveWhy) checked.push("fiveWhy");
  if (toolsUsed.brainstorming) checked.push("brainstorming");
  return checked.length === 1 ? checked[0]! : null;
}
