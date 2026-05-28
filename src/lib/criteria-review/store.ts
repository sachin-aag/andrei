import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { HumanReviewer, HumanSubAnswerDraft } from "@/lib/criteria-review/human-judgment";
import {
  isReportLevelCriteriaReviewItem,
  type CriteriaReviewDatasetItem,
  type CriteriaReviewForReviewer,
  type CriteriaReviewSessionMetadata,
} from "@/lib/criteria-review/report-data";

type SubmissionRow = typeof schema.criteriaReviewSubmissions.$inferSelect;
type WorkspaceUserRow = typeof schema.workspaceUsers.$inferSelect;
type ReportRow = typeof schema.criteriaReviewReports.$inferSelect;

function reviewerFromRow(row: WorkspaceUserRow): HumanReviewer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
  };
}

function assembleItem(
  report: ReportRow,
  submissions: SubmissionRow[],
  reviewersById: Map<string, WorkspaceUserRow>
): CriteriaReviewDatasetItem {
  const humanReviews: Record<string, CriteriaReviewForReviewer> = {};
  for (const sub of submissions) {
    const reviewerRow = reviewersById.get(sub.reviewerId);
    if (!reviewerRow) continue;
    humanReviews[sub.reviewerId] = {
      reviewer: reviewerFromRow(reviewerRow),
      answers: (sub.answers ?? {}) as Record<string, HumanSubAnswerDraft>,
      reviewedAt: sub.reviewedAt?.toISOString(),
      status: sub.status,
    };
  }

  return {
    id: report.id,
    input: report.input as CriteriaReviewDatasetItem["input"],
    expectedOutput:
      report.expectedOutput as CriteriaReviewDatasetItem["expectedOutput"],
    metadata: {
      sourceFile: report.sourceFile,
      deviationNo: report.deviationNo,
      totalCriterionCount: report.totalCriterionCount,
      promptVersion: report.promptVersion,
      humanReviewStatus: report.humanReviewStatus,
      humanReviews,
    },
  };
}

async function loadSubmissionsForReports(
  reportIds: string[]
): Promise<Map<string, SubmissionRow[]>> {
  if (reportIds.length === 0) return new Map();

  const submissions = await db.query.criteriaReviewSubmissions.findMany({
    where: inArray(schema.criteriaReviewSubmissions.reportId, reportIds),
    orderBy: [asc(schema.criteriaReviewSubmissions.updatedAt)],
  });

  const byReport = new Map<string, SubmissionRow[]>();
  for (const sub of submissions) {
    const list = byReport.get(sub.reportId) ?? [];
    list.push(sub);
    byReport.set(sub.reportId, list);
  }
  return byReport;
}

async function loadReviewersForIds(
  reviewerIds: string[]
): Promise<Map<string, WorkspaceUserRow>> {
  if (reviewerIds.length === 0) return new Map();

  const rows = await db.query.workspaceUsers.findMany({
    where: inArray(schema.workspaceUsers.id, reviewerIds),
  });
  return new Map(rows.map((r) => [r.id, r]));
}

async function reportToItem(report: ReportRow): Promise<CriteriaReviewDatasetItem | null> {
  const submissionsByReport = await loadSubmissionsForReports([report.id]);
  const submissions = submissionsByReport.get(report.id) ?? [];
  const reviewerIds = [...new Set(submissions.map((s) => s.reviewerId))];
  const reviewersById = await loadReviewersForIds(reviewerIds);
  const item = assembleItem(report, submissions, reviewersById);
  return isReportLevelCriteriaReviewItem(item) ? item : null;
}

async function syncHumanReviews(
  reportId: string,
  humanReviews: NonNullable<CriteriaReviewSessionMetadata["humanReviews"]>
): Promise<void> {
  for (const review of Object.values(humanReviews)) {
    const reviewedAt = review.reviewedAt
      ? new Date(review.reviewedAt)
      : null;

    await db
      .insert(schema.criteriaReviewSubmissions)
      .values({
        reportId,
        reviewerId: review.reviewer.id,
        status: review.status,
        answers: review.answers,
        reviewedAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.criteriaReviewSubmissions.reportId,
          schema.criteriaReviewSubmissions.reviewerId,
        ],
        set: {
          status: review.status,
          answers: review.answers,
          reviewedAt,
          updatedAt: new Date(),
        },
      });
  }
}

export async function listCriteriaReviewSessions(): Promise<
  CriteriaReviewDatasetItem[]
> {
  const reports = await db.query.criteriaReviewReports.findMany({
    orderBy: [
      asc(schema.criteriaReviewReports.sourceFile),
      asc(schema.criteriaReviewReports.deviationNo),
    ],
  });

  if (reports.length === 0) return [];

  const reportIds = reports.map((r) => r.id);
  const submissionsByReport = await loadSubmissionsForReports(reportIds);
  const allReviewerIds = [
    ...new Set(
      [...submissionsByReport.values()].flatMap((subs) =>
        subs.map((s) => s.reviewerId)
      )
    ),
  ];
  const reviewersById = await loadReviewersForIds(allReviewerIds);

  const items: CriteriaReviewDatasetItem[] = [];
  for (const report of reports) {
    const submissions = submissionsByReport.get(report.id) ?? [];
    const item = assembleItem(report, submissions, reviewersById);
    if (isReportLevelCriteriaReviewItem(item)) {
      items.push(item);
    }
  }
  return items;
}

export async function getCriteriaReviewSession(
  id: string
): Promise<CriteriaReviewDatasetItem | null> {
  const report = await db.query.criteriaReviewReports.findFirst({
    where: eq(schema.criteriaReviewReports.id, id),
  });
  if (!report) return null;
  return reportToItem(report);
}

export async function upsertCriteriaReviewSessionItem(
  item: CriteriaReviewDatasetItem,
  options: { preserveHumanReview?: boolean } = {}
): Promise<void> {
  const existing = options.preserveHumanReview
    ? await getCriteriaReviewSession(item.id)
    : null;

  const humanReviewStatus =
    existing && options.preserveHumanReview
      ? existing.metadata.humanReviewStatus
      : item.metadata.humanReviewStatus;

  const now = new Date();
  await db
    .insert(schema.criteriaReviewReports)
    .values({
      id: item.id,
      sourceFile: item.metadata.sourceFile,
      deviationNo: item.metadata.deviationNo,
      reportDate: item.input.reportDate,
      promptVersion: item.metadata.promptVersion,
      totalCriterionCount: item.metadata.totalCriterionCount,
      input: item.input,
      expectedOutput: item.expectedOutput,
      humanReviewStatus,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.criteriaReviewReports.id,
      set: {
        sourceFile: item.metadata.sourceFile,
        deviationNo: item.metadata.deviationNo,
        reportDate: item.input.reportDate,
        promptVersion: item.metadata.promptVersion,
        totalCriterionCount: item.metadata.totalCriterionCount,
        input: item.input,
        expectedOutput: item.expectedOutput,
        humanReviewStatus,
        updatedAt: now,
      },
    });

  const humanReviews = item.metadata.humanReviews;
  if (
    humanReviews &&
    Object.keys(humanReviews).length > 0 &&
    !options.preserveHumanReview
  ) {
    await syncHumanReviews(item.id, humanReviews);
  }
}

export async function saveCriteriaReviewSession(
  item: CriteriaReviewDatasetItem
): Promise<CriteriaReviewDatasetItem> {
  const now = new Date();
  await db
    .update(schema.criteriaReviewReports)
    .set({
      humanReviewStatus: item.metadata.humanReviewStatus,
      updatedAt: now,
    })
    .where(eq(schema.criteriaReviewReports.id, item.id));

  if (item.metadata.humanReviews) {
    await syncHumanReviews(item.id, item.metadata.humanReviews);
  }

  const saved = await getCriteriaReviewSession(item.id);
  if (!saved) {
    throw new Error(`Review session not found after save: ${item.id}`);
  }
  return saved;
}
