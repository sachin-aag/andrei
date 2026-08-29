import { and, desc, eq } from "drizzle-orm";
import { activeReportsFilter } from "@/lib/reports/tombstone";
import { db } from "@/db";
import {
  aiFeedbackResponses,
  aiFeedbackSessions,
  criteriaEvaluations,
  reportSections,
  reports,
  type DocumentType,
} from "@/db/schema";
import type { AllSectionsContent } from "@/lib/ai/evaluate";
import { sectionsReadyForEvaluation } from "@/lib/ai/evaluation-readiness";
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
import {
  evaluationCapabilityFor,
  getDocumentType,
  getEvaluatableSections,
  mergeSectionForType,
} from "@/lib/document-types";

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

async function loadSectionContents(
  reportId: string,
  documentType: DocumentType
): Promise<AllSectionsContent> {
  const evalRows = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));

  const evaluatable = new Set(
    getEvaluatableSections(documentType).map((section) => section.key)
  );
  const allSections: AllSectionsContent = {};
  for (const row of evalRows) {
    if (evaluatable.has(row.section)) {
      allSections[row.section] = mergeSectionForType(
        documentType,
        row.section,
        row.content
      );
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
    deviationNo: report.documentNo,
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

  const sectionContents = await loadSectionContents(
    row.session.reportId,
    row.report.documentType
  );

  return buildImproveAiSessionView({
    session: row.session,
    report: row.report,
    sectionContents,
    responses,
  });
}

/**
 * Re-runs evaluation when a ready session has no reviewable criteria but the
 * report has evaluable content. Fixes Convergent/DV sessions created while
 * Improve AI only walked investigation sections (Review 404 / empty 0/0).
 */
export async function getImproveAiSessionViewOrHeal(
  sessionId: string,
  userId: string
): Promise<ImproveAiSessionView | null> {
  const view = await getImproveAiSessionView(sessionId, userId);
  if (!view) return null;
  if (view.status === "evaluating" || view.sections.length > 0) return view;

  const [row] = await db
    .select({
      session: aiFeedbackSessions,
      report: reports,
    })
    .from(aiFeedbackSessions)
    .innerJoin(reports, eq(aiFeedbackSessions.reportId, reports.id))
    .where(eq(aiFeedbackSessions.id, sessionId));

  if (!row || row.session.submittedBy !== userId) return view;

  const documentType = row.report.documentType;
  if (evaluationCapabilityFor(getDocumentType(documentType)).kind === "none") {
    return view;
  }

  const sectionContents = await loadSectionContents(
    row.session.reportId,
    documentType
  );
  const readiness = sectionsReadyForEvaluation({
    documentType,
    targets: getEvaluatableSections(documentType).map((section) => section.key),
    documentNo: String(row.report.documentNo ?? ""),
    contentFor: (section) =>
      section === "cover_page" ? row.report.metadata : sectionContents[section],
  });
  if (readiness.ready.length === 0) return view;

  await rerunImproveAiSession(sessionId, userId);
  return (await getImproveAiSessionView(sessionId, userId)) ?? view;
}

export async function checkImproveAiSessionStale(
  sessionId: string,
  reportId: string
): Promise<boolean> {
  const [report] = await db
    .select({ documentType: reports.documentType })
    .from(reports)
    .where(eq(reports.id, reportId));
  const documentType = report?.documentType ?? "investigation_report";

  const [responses, evaluations, sectionContents] = await Promise.all([
    db
      .select()
      .from(aiFeedbackResponses)
      .where(eq(aiFeedbackResponses.sessionId, sessionId)),
    db
      .select()
      .from(criteriaEvaluations)
      .where(eq(criteriaEvaluations.reportId, reportId)),
    loadSectionContents(reportId, documentType),
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
