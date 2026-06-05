import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiFeedbackResponses } from "@/db/schema";
import type { ReportEvaluationRow } from "@/lib/improve-ai/evaluate-report";

/** Seeds or refreshes AI baseline rows on a feedback session from evaluation results. */
export async function syncFeedbackResponsesFromEvaluations(
  sessionId: string,
  evaluations: ReportEvaluationRow[]
): Promise<void> {
  const evaluatable = evaluations.filter((row) =>
    ["define", "measure", "analyze", "improve", "control"].includes(row.section)
  );

  for (const row of evaluatable) {
    await db
      .insert(aiFeedbackResponses)
      .values({
        sessionId,
        criterionKey: row.criterionKey,
        section: row.section,
        aiStatus: row.status,
        aiReasoning: row.reasoning,
      })
      .onConflictDoUpdate({
        target: [
          aiFeedbackResponses.sessionId,
          aiFeedbackResponses.criterionKey,
        ],
        set: {
          section: row.section,
          aiStatus: row.status,
          aiReasoning: row.reasoning,
          updatedAt: new Date(),
        },
      });
  }
}

export async function clearFeedbackResponses(sessionId: string): Promise<void> {
  await db
    .delete(aiFeedbackResponses)
    .where(eq(aiFeedbackResponses.sessionId, sessionId));
}
