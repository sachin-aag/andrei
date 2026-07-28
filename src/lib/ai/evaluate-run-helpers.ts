import type { CriterionEvaluationResult } from "@/lib/ai/evaluate";
import {
  ANALYZE_METHOD_LABELS,
  detectAnalyzeMethod,
  existingAnalyzeTool,
  meaningfulAnalyzeText,
  type AnalyzeMethod,
} from "@/lib/analyze/method";

export {
  meaningfulAnalyzeText,
  existingAnalyzeTool,
  detectAnalyzeMethod,
};
export type { AnalyzeMethod };

const TOOL_COMPLETENESS_KEYS = [
  "analyze.sixm_completeness",
  "analyze.fivewhy_completeness",
] as const;

/**
 * After evaluation, if the analyze section has both sixm_completeness and
 * fivewhy_completeness results, check which tool the content actually uses
 * and mark unused tool criteria as "met" with a reasoning note.
 *
 * 6M / 5-Why / Brainstorming are three alternatives: completing one satisfies
 * the root-cause tool requirement. When brainstorming is chosen, both
 * sixm and fivewhy completeness criteria are marked met.
 */
export function normalizeAnalyzeToolResults(
  content: unknown,
  evaluations: CriterionEvaluationResult[]
): CriterionEvaluationResult[] {
  const chosenMethod = detectAnalyzeMethod(content);
  if (!chosenMethod) return evaluations;

  const chosenLabel = ANALYZE_METHOD_LABELS[chosenMethod];

  return evaluations.map((evaluation) => {
    if (
      !(TOOL_COMPLETENESS_KEYS as readonly string[]).includes(
        evaluation.criterionKey
      )
    ) {
      return evaluation;
    }

    // Active tool criterion stays as the model graded it.
    if (
      (chosenMethod === "sixM" &&
        evaluation.criterionKey === "analyze.sixm_completeness") ||
      (chosenMethod === "fiveWhy" &&
        evaluation.criterionKey === "analyze.fivewhy_completeness")
    ) {
      return evaluation;
    }

    const unusedLabel =
      evaluation.criterionKey === "analyze.sixm_completeness" ? "6M" : "5-Why";

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
