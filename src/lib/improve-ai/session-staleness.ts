import type { SectionType } from "@/db/schema";
import type { AllSectionsContent } from "@/lib/ai/evaluate";
import { sectionContentHash } from "@/lib/ai/suggestion-gating";
import type { aiFeedbackResponses, criteriaEvaluations } from "@/db/schema";

type FeedbackResponse = typeof aiFeedbackResponses.$inferSelect;
type EvaluationRow = typeof criteriaEvaluations.$inferSelect;

export function isImproveAiSessionStale(params: {
  responses: FeedbackResponse[];
  evaluations: EvaluationRow[];
  sectionContents: AllSectionsContent;
}): boolean {
  if (params.responses.length === 0) return false;

  const evalByKey = new Map(
    params.evaluations.map((row) => [row.criterionKey, row])
  );
  const responseKeys = new Set<string>();

  for (const response of params.responses) {
    responseKeys.add(response.criterionKey);
    const evaluation = evalByKey.get(response.criterionKey);
    if (!evaluation) return true;

    const sectionContent = params.sectionContents[response.section as SectionType];
    const currentHash = sectionContentHash(
      response.section as SectionType,
      sectionContent
    );
    if (
      evaluation.evaluatedContentHash &&
      evaluation.evaluatedContentHash !== currentHash
    ) {
      return true;
    }

    if (
      response.aiStatus !== evaluation.status ||
      response.aiReasoning !== evaluation.reasoning
    ) {
      return true;
    }
  }

  for (const evaluation of params.evaluations) {
    if (!responseKeys.has(evaluation.criterionKey)) {
      const sectionContent =
        params.sectionContents[evaluation.section as SectionType];
      if (sectionContent !== undefined) return true;
    }
  }

  return false;
}
