import { and, desc, eq } from "drizzle-orm";
import { activeReportsFilter } from "@/lib/reports/tombstone";
import { db } from "@/db";
import {
  aiFeedbackResponses,
  aiFeedbackSessions,
  criteriaEvaluations,
  reportSections,
  reports,
} from "@/db/schema";
import type { AllSectionsContent } from "@/lib/ai/evaluate";
import {
  evaluateReportCriteria,
  ImproveAiEvaluationError,
} from "@/lib/improve-ai/evaluate-report";
import {
  buildImproveAiSessionView,
  type ImproveAiSessionView,
} from "@/lib/improve-ai/session-view";
import {
  clearFeedbackResponses,
  syncFeedbackResponsesFromEvaluations,
} from "@/lib/improve-ai/sync-feedback-responses";
import { isImproveAiSessionStale } from "@/lib/improve-ai/session-staleness";
import type { HumanSubAnswerDraft } from "@/lib/improve-ai/human-judgment";
import { humanAnswerKey } from "@/lib/improve-ai/human-judgment";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";

export type ImproveAiSessionListItem = {
  id: string;
  reportId: string;
  deviationNo: string;
  sourceLabel: string;
  sourceType: (typeof aiFeedbackSessions.$inferSelect)["sourceType"];
  status: (typeof aiFeedbackSessions.$inferSelect)["status"];
  createdAt: Date;
  updatedAt: Date;
};

async function loadSectionContents(reportId: string): Promise<AllSectionsContent> {
  const evalRows = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));

  const allSections: AllSectionsContent = {};
  for (const row of evalRows) {
    if (EVALUATABLE_SECTIONS.includes(row.section as (typeof EVALUATABLE_SECTIONS)[number])) {
      allSections[row.section] = row.content;
    }
  }
  return allSections;
}

export async function listImproveAiSessionsForUser(
  userId: string
): Promise<ImproveAiSessionListItem[]> {
  const rows = await db
    .select({
      session: aiFeedbackSessions,
      report: reports,
    })
    .from(aiFeedbackSessions)
    .innerJoin(reports, eq(aiFeedbackSessions.reportId, reports.id))
    .where(
      and(eq(aiFeedbackSessions.submittedBy, userId), activeReportsFilter())
    )
    .orderBy(desc(aiFeedbackSessions.updatedAt));

  return rows.map(({ session, report }) => ({
    id: session.id,
    reportId: session.reportId,
    deviationNo: report.deviationNo,
    sourceLabel: session.sourceLabel,
    sourceType: session.sourceType,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }));
}

export async function findImproveAiSessionForReport(
  reportId: string,
  userId: string
): Promise<typeof aiFeedbackSessions.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(aiFeedbackSessions)
    .where(
      and(
        eq(aiFeedbackSessions.reportId, reportId),
        eq(aiFeedbackSessions.submittedBy, userId)
      )
    );
  return row ?? null;
}

export async function getImproveAiSessionView(
  sessionId: string,
  userId: string
): Promise<ImproveAiSessionView | null> {
  const [row] = await db
    .select({
      session: aiFeedbackSessions,
      report: reports,
    })
    .from(aiFeedbackSessions)
    .innerJoin(reports, eq(aiFeedbackSessions.reportId, reports.id))
    .where(eq(aiFeedbackSessions.id, sessionId));

  if (!row || row.session.submittedBy !== userId) return null;

  const responses = await db
    .select()
    .from(aiFeedbackResponses)
    .where(eq(aiFeedbackResponses.sessionId, sessionId));

  const sectionContents = await loadSectionContents(row.session.reportId);

  return buildImproveAiSessionView({
    session: row.session,
    report: row.report,
    sectionContents,
    responses,
  });
}

export async function checkImproveAiSessionStale(
  sessionId: string,
  reportId: string
): Promise<boolean> {
  const [responses, evaluations, sectionContents] = await Promise.all([
    db
      .select()
      .from(aiFeedbackResponses)
      .where(eq(aiFeedbackResponses.sessionId, sessionId)),
    db
      .select()
      .from(criteriaEvaluations)
      .where(eq(criteriaEvaluations.reportId, reportId)),
    loadSectionContents(reportId),
  ]);

  return isImproveAiSessionStale({
    responses,
    evaluations,
    sectionContents,
  });
}

export async function rerunImproveAiSession(
  sessionId: string,
  userId: string
): Promise<typeof aiFeedbackSessions.$inferSelect> {
  const [session] = await db
    .select()
    .from(aiFeedbackSessions)
    .where(eq(aiFeedbackSessions.id, sessionId));
  if (!session || session.submittedBy !== userId) {
    throw new ImproveAiEvaluationError("Session not found", 404);
  }

  await clearFeedbackResponses(sessionId);
  await runEvaluationForSession(sessionId);

  const [updated] = await db
    .select()
    .from(aiFeedbackSessions)
    .where(eq(aiFeedbackSessions.id, sessionId));
  if (!updated) {
    throw new ImproveAiEvaluationError("Session not found", 404);
  }
  return updated;
}

export async function runEvaluationForSession(sessionId: string): Promise<void> {
  const [session] = await db
    .select()
    .from(aiFeedbackSessions)
    .where(eq(aiFeedbackSessions.id, sessionId));
  if (!session) {
    throw new ImproveAiEvaluationError("Session not found", 404);
  }

  await db
    .update(aiFeedbackSessions)
    .set({ status: "evaluating", updatedAt: new Date() })
    .where(eq(aiFeedbackSessions.id, sessionId));

  const evaluations = await evaluateReportCriteria(session.reportId);
  await syncFeedbackResponsesFromEvaluations(sessionId, evaluations);
  await db
    .update(aiFeedbackSessions)
    .set({ status: "ready_for_review", updatedAt: new Date() })
    .where(eq(aiFeedbackSessions.id, sessionId));
}

export async function createImproveAiSession(params: {
  reportId: string;
  userId: string;
  sourceType: (typeof aiFeedbackSessions.$inferSelect)["sourceType"];
  sourceLabel: string;
  runEvaluation?: boolean;
}): Promise<typeof aiFeedbackSessions.$inferSelect> {
  const existing = await findImproveAiSessionForReport(params.reportId, params.userId);
  if (existing) return existing;

  const [session] = await db
    .insert(aiFeedbackSessions)
    .values({
      reportId: params.reportId,
      submittedBy: params.userId,
      sourceType: params.sourceType,
      sourceLabel: params.sourceLabel,
      status: "evaluating",
    })
    .returning();

  if (!session) {
    throw new Error("Failed to create Improve AI session");
  }

  if (params.runEvaluation !== false) {
    await runEvaluationForSession(session.id);
    const [updated] = await db
      .select()
      .from(aiFeedbackSessions)
      .where(eq(aiFeedbackSessions.id, session.id));
    return updated ?? session;
  }

  return session;
}

export async function saveImproveAiFeedbackDraft(
  sessionId: string,
  userId: string,
  answers: HumanSubAnswerDraft[]
): Promise<void> {
  const [session] = await db
    .select()
    .from(aiFeedbackSessions)
    .where(eq(aiFeedbackSessions.id, sessionId));
  if (!session || session.submittedBy !== userId) {
    throw new ImproveAiEvaluationError("Session not found", 404);
  }

  const now = new Date();
  for (const answer of answers) {
    const key = humanAnswerKey(answer.section, answer.criterionKey);
    void key;
    await db
      .update(aiFeedbackResponses)
      .set({
        criteriaEvaluationAgreement:
          answer.criteriaEvaluationAgreement ?? null,
        reasoningAgreement: answer.reasoningAgreement ?? null,
        humanComment: answer.comment?.trim() ?? "",
        suggestedStatus: answer.suggestedStatus ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiFeedbackResponses.sessionId, sessionId),
          eq(aiFeedbackResponses.criterionKey, answer.criterionKey)
        )
      );
  }

  if (session.status === "evaluating") {
    await db
      .update(aiFeedbackSessions)
      .set({ status: "ready_for_review", updatedAt: now })
      .where(eq(aiFeedbackSessions.id, sessionId));
  } else {
    await db
      .update(aiFeedbackSessions)
      .set({ updatedAt: now })
      .where(eq(aiFeedbackSessions.id, sessionId));
  }
}

export async function completeImproveAiSession(
  sessionId: string,
  userId: string
): Promise<void> {
  const [session] = await db
    .select()
    .from(aiFeedbackSessions)
    .where(eq(aiFeedbackSessions.id, sessionId));
  if (!session || session.submittedBy !== userId) {
    throw new ImproveAiEvaluationError("Session not found", 404);
  }

  await db
    .update(aiFeedbackSessions)
    .set({ status: "reviewed", updatedAt: new Date() })
    .where(eq(aiFeedbackSessions.id, sessionId));
}
