import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { listAdminUsers, type AdminUser } from "@/lib/admin/users";
import {
  listReportManagerIdsByReportIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";

export type AdminReportSummary = {
  id: string;
  deviationNo: string;
  date: Date;
  status: string;
  authorId: string;
  assignedManagerId: string | null;
  assignedManagerIds: string[];
  updatedAt: Date;
  deletedAt: Date | null;
  deletedById: string | null;
};

export type AdminReportAuthorOption = AdminUser & {
  reportCount: number;
};

export async function listAdminReportSummaries(options?: {
  authorId?: string;
  includeDeleted?: boolean;
}): Promise<AdminReportSummary[]> {
  const query = db
    .select({
      id: reports.id,
      deviationNo: reports.deviationNo,
      date: reports.date,
      status: reports.status,
      authorId: reports.authorId,
      assignedManagerId: reports.assignedManagerId,
      updatedAt: reports.updatedAt,
      deletedAt: reports.deletedAt,
      deletedById: reports.deletedById,
    })
    .from(reports)
    .orderBy(desc(reports.updatedAt));

  const rows = options?.authorId
    ? await query.where(eq(reports.authorId, options.authorId))
    : await query;

  const filtered = options?.includeDeleted
    ? rows
    : rows.filter((row) => row.deletedAt == null);

  const managerIdsByReportId = await listReportManagerIdsByReportIds(
    filtered.map((row) => row.id)
  );
  return filtered.map((row) =>
    withAssignedManagerIds(row, managerIdsByReportId.get(row.id) ?? [])
  );
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
      .where(sql`${reports.deletedAt} is null`)
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
