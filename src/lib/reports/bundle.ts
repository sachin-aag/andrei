import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  comments,
  criteriaEvaluations,
  reports,
  reportSections,
} from "@/db/schema";
import type { ReportBundle } from "@/types/report";

// Loads the section/evaluation/comment rows for a report in parallel. Split
// out from loadReportBundle so callers that authorize on the report row first
// (e.g. the GET route) can reuse the same fetch without re-querying the report.
//
// Dismissed comments stay in the DB but are excluded here so ignored AI
// suggestions and dismissed human threads do not clutter the gutter or the
// highlight overlay.
export async function loadReportSubtables(reportId: string) {
  const [sections, evaluations, commentRows] = await Promise.all([
    db
      .select()
      .from(reportSections)
      .where(eq(reportSections.reportId, reportId)),
    db
      .select()
      .from(criteriaEvaluations)
      .where(eq(criteriaEvaluations.reportId, reportId)),
    db
      .select()
      .from(comments)
      .where(
        and(eq(comments.reportId, reportId), ne(comments.status, "dismissed"))
      ),
  ]);

  return { sections, evaluations, comments: commentRows };
}

export async function loadReportBundle(
  reportId: string
): Promise<ReportBundle | null> {
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return null;

  const subtables = await loadReportSubtables(reportId);

  return JSON.parse(JSON.stringify({ report, ...subtables })) as ReportBundle;
}
