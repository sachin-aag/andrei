import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  comments,
  criteriaEvaluations,
  reports,
  reportSections,
} from "@/db/schema";
import type { ReportBundle } from "@/types/report";
import { listAdminUsers, type AdminUser } from "@/lib/admin/users";

export type AdminReportSummary = {
  id: string;
  deviationNo: string;
  date: Date;
  status: string;
  authorId: string;
  assignedManagerId: string | null;
  updatedAt: Date;
};

export type AdminReportAuthorOption = AdminUser & {
  reportCount: number;
};

function serializeBundle(bundle: {
  report: typeof reports.$inferSelect;
  sections: (typeof reportSections.$inferSelect)[];
  evaluations: (typeof criteriaEvaluations.$inferSelect)[];
  comments: (typeof comments.$inferSelect)[];
}): ReportBundle {
  return JSON.parse(JSON.stringify(bundle)) as ReportBundle;
}

export async function listAdminReportSummaries(
  authorId?: string
): Promise<AdminReportSummary[]> {
  const query = db
    .select({
      id: reports.id,
      deviationNo: reports.deviationNo,
      date: reports.date,
      status: reports.status,
      authorId: reports.authorId,
      assignedManagerId: reports.assignedManagerId,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .orderBy(desc(reports.updatedAt));

  if (authorId) {
    return query.where(eq(reports.authorId, authorId));
  }

  return query;
}

export async function listAdminReportAuthorOptions(): Promise<
  AdminReportAuthorOption[]
> {
  const [users, counts] = await Promise.all([
    listAdminUsers(),
    db
      .select({
        authorId: reports.authorId,
        reportCount: sql<number>`count(*)::int`,
      })
      .from(reports)
      .groupBy(reports.authorId),
  ]);

  const countByAuthor = new Map(
    counts.map((row) => [row.authorId, row.reportCount])
  );

  return users
    .map((user) => ({
      ...user,
      reportCount: countByAuthor.get(user.id) ?? 0,
    }))
    .filter((user) => user.reportCount > 0 || user.role !== "admin")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadReportBundle(
  reportId: string
): Promise<ReportBundle | null> {
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return null;

  const [sectionRows, evals, commentRows] = await Promise.all([
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

  return serializeBundle({
    report,
    sections: sectionRows,
    evaluations: evals,
    comments: commentRows,
  });
}
