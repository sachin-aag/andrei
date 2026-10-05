import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  comments,
  criteriaEvaluations,
  reports,
  reportSections,
} from "@/db/schema";
import type { ReportBundle } from "@/types/report";
import { listActiveAttachments } from "@/lib/attachments/list-active";
import { listAttachmentFolders } from "@/lib/attachments/folders";
import {
  listReportManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";
import {
  liveWorkspaceCommentsWhere,
  slimWorkspaceComments,
} from "@/lib/comments/slim-workspace-comments";
import { sourceDocxFilenameFor } from "@/lib/reports/persist-source-docx";

async function timeStage<T>(
  stages: Record<string, number>,
  name: string,
  work: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    stages[name] = Date.now() - started;
  }
}

/** Report row + assigned managers. Cheap enough for /edit authz without the body. */
export async function loadReportAuth(reportId: string) {
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return null;
  const managerIds = await listReportManagerIds(reportId);
  return withAssignedManagerIds(report, managerIds);
}

/**
 * Sections, evaluations, and live comments only. Attachment metadata is a
 * second request so 40+ files cannot hold first paint.
 */
export async function loadReportWorkspaceBody(reportId: string) {
  const stages: Record<string, number> = {};
  const [sections, evaluations, commentRows] = await Promise.all([
    timeStage(stages, "sections", () =>
      db
        .select()
        .from(reportSections)
        .where(eq(reportSections.reportId, reportId))
    ),
    timeStage(stages, "evaluations", () =>
      db
        .select()
        .from(criteriaEvaluations)
        .where(eq(criteriaEvaluations.reportId, reportId))
    ),
    timeStage(stages, "comments", () =>
      db
        .select()
        .from(comments)
        .where(liveWorkspaceCommentsWhere(reportId))
    ),
  ]);

  return {
    sections,
    evaluations,
    comments: slimWorkspaceComments(commentRows),
    stages,
  };
}

// Loads the section/evaluation/comment/attachment rows for a report in parallel.
// Split out from loadReportBundle so callers that authorize on the report row
// first (e.g. the GET route) can reuse the same fetch without re-querying.
//
// Dismissed comments and applied AI suggestion rows stay in the DB but are
// excluded here so Apply-all tableOperation JSON (ELR / QSR) does not ride
// every /edit RSC. Open suggestions and human threads still load.
export async function loadReportSubtables(reportId: string) {
  const [body, attachments, attachmentFolders] = await Promise.all([
    loadReportWorkspaceBody(reportId),
    listActiveAttachments(reportId),
    listAttachmentFolders(reportId),
  ]);

  return {
    sections: body.sections,
    evaluations: body.evaluations,
    comments: body.comments,
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
