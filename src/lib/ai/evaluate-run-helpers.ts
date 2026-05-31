import type { CriterionEvaluationResult } from "@/lib/ai/evaluate";
import { normalizeRichField, richJsonToPlainText } from "@/lib/tiptap/rich-text";

type AnalyzeTool = "sixM" | "fiveWhy";

export function meaningfulAnalyzeText(value: unknown): boolean {
  const text =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "type" in value
        ? richJsonToPlainText(normalizeRichField(value))
        : "";
  const normalized = text.trim().toLowerCase().replace(/\.+$/, "");
  return normalized.length > 0 && normalized !== "not applicable" && normalized !== "n/a";
}

export function existingAnalyzeTool(content: unknown): AnalyzeTool | null {
  if (!content || typeof content !== "object") return null;
  const c = content as {
    sixM?: Record<string, unknown>;
    fiveWhy?: Record<string, unknown>;
  };
  const hasSixM = c.sixM
    ? Object.values(c.sixM).some(meaningfulAnalyzeText)
    : false;
  const hasFiveWhy = c.fiveWhy
    ? [c.fiveWhy.narrative, c.fiveWhy.conclusion].some(meaningfulAnalyzeText)
    : false;

  if (hasSixM && !hasFiveWhy) return "sixM";
  if (hasFiveWhy && !hasSixM) return "fiveWhy";
  return null;
}

/**
 * After evaluation, if the analyze section has both sixm_completeness and
 * fivewhy_completeness results, check which tool the content actually uses
 * and mark the unused one as "met" with a reasoning note.
 */
export function normalizeAnalyzeToolResults(
  content: unknown,
  evaluations: CriterionEvaluationResult[]
): CriterionEvaluationResult[] {
  const chosenTool = existingAnalyzeTool(content);
  if (!chosenTool) return evaluations;

  const unusedKey =
    chosenTool === "fiveWhy"
      ? "analyze.sixm_completeness"
      : "analyze.fivewhy_completeness";
  const chosenLabel = chosenTool === "fiveWhy" ? "5-Why" : "6M";
  const unusedLabel = chosenTool === "fiveWhy" ? "6M" : "5-Why";

  return evaluations.map((evaluation) => {
    if (evaluation.criterionKey !== unusedKey) return evaluation;
    return {
      ...evaluation,
      status: "met" as const,
      reasoning: `${chosenLabel} methodology selected for this Analyze pass; ${unusedLabel} remains Not Applicable because the root-cause tool requirement is satisfied by one completed methodology.`,
    };
  });
}

export function normalizePromptText(s: string, maxChars = 6000): string {
  const trimmed = s.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n[Truncated for context length]`;
}
