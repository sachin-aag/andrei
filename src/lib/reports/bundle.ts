import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  comments,
  criteriaEvaluations,
  reports,
  reportSections,
} from "@/db/schema";
import { commentsVisibleToWorkspaceWhere } from "@/lib/suggestions/visible-comments";
import type { ReportBundle } from "@/types/report";
import { listActiveAttachments } from "@/lib/attachments/list-active";
import { listAttachmentFolders } from "@/lib/attachments/folders";
import {
  listReportManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";
import { sourceDocxFilenameFor } from "@/lib/reports/persist-source-docx";

// Loads the section/evaluation/comment/attachment rows for a report in parallel.
// Split out from loadReportBundle so callers that authorize on the report row
// first (e.g. the GET route) can reuse the same fetch without re-querying.
//
// Ordinary dismissals stay in the DB but are excluded here so ignored AI
// suggestions and dismissed human threads do not clutter the gutter.
// Superseded dismissals stay visible so the engineer can reopen them.
export async function loadReportSubtables(reportId: string) {
  const [sections, evaluations, commentRows, attachments, attachmentFolders] =
    await Promise.all([
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
        .where(commentsVisibleToWorkspaceWhere(reportId)),
      listActiveAttachments(reportId),
      listAttachmentFolders(reportId),
    ]);

  return {
    sections,
    evaluations,
    comments: commentRows,
    attachments,
    attachmentFolders,
  };
}

export async function loadReportBundle(
  reportId: string
): Promise<ReportBundle | null> {
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return null;

  const [subtables, managerIds, sourceDocxFilename] = await Promise.all([
    loadReportSubtables(reportId),
    listReportManagerIds(reportId),
    sourceDocxFilenameFor(reportId),
  ]);

  return JSON.parse(
    JSON.stringify({
      report: {
        ...withAssignedManagerIds(report, managerIds),
        sourceDocxFilename,
      },
      ...subtables,
    })
  ) as ReportBundle;
}
