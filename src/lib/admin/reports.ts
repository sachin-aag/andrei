import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
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
