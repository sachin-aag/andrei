import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reportManagers, workspaceUsers } from "@/db/schema";
import {
  normalizeAssignedManagerIds,
} from "@/lib/reports/assigned-manager-ids";

export type { LegacyReportManagers } from "@/lib/reports/assigned-manager-ids";
export {
  assignedManagerIdsForReport,
  managerIdsFromFormData,
  normalizeAssignedManagerIds,
  primaryAssignedManagerId,
  withAssignedManagerIds,
} from "@/lib/reports/assigned-manager-ids";

export async function validateAssignedManagerIds(
  managerIds: string[]
): Promise<{ ok: true } | { ok: false; invalidIds: string[] }> {
  if (managerIds.length === 0) return { ok: true };

  const rows = await db
    .select({ id: workspaceUsers.id })
    .from(workspaceUsers)
    .where(inArray(workspaceUsers.id, managerIds));

  const validIds = new Set(rows.map((row) => row.id));
  const invalidIds = managerIds.filter((id) => !validIds.has(id));
  if (invalidIds.length > 0) return { ok: false, invalidIds };

  const managerRows = await db
    .select({ id: workspaceUsers.id })
    .from(workspaceUsers)
    .where(
      and(inArray(workspaceUsers.id, managerIds), eq(workspaceUsers.role, "manager"))
    );

  const managerIdSet = new Set(managerRows.map((row) => row.id));
  const nonManagerIds = managerIds.filter((id) => !managerIdSet.has(id));
  return nonManagerIds.length > 0
    ? { ok: false, invalidIds: nonManagerIds }
    : { ok: true };
}

export async function listReportManagerIds(reportId: string): Promise<string[]> {
  const rows = await db
    .select({ managerId: reportManagers.managerId })
    .from(reportManagers)
    .where(eq(reportManagers.reportId, reportId))
    .orderBy(asc(reportManagers.sortOrder), asc(reportManagers.createdAt));

  return rows.map((row) => row.managerId);
}

export async function listReportManagerIdsByReportIds(
  reportIds: string[]
): Promise<Map<string, string[]>> {
  if (reportIds.length === 0) return new Map();

  const rows = await db
    .select({
      reportId: reportManagers.reportId,
      managerId: reportManagers.managerId,
    })
    .from(reportManagers)
    .where(inArray(reportManagers.reportId, reportIds))
    .orderBy(
      asc(reportManagers.reportId),
      asc(reportManagers.sortOrder),
      asc(reportManagers.createdAt)
    );

  const idsByReportId = new Map<string, string[]>();
  for (const row of rows) {
    const ids = idsByReportId.get(row.reportId) ?? [];
    ids.push(row.managerId);
    idsByReportId.set(row.reportId, ids);
  }

  return idsByReportId;
}

export async function insertReportManagers(
  reportId: string,
  managerIds: string[]
): Promise<void> {
  const values = normalizeAssignedManagerIds(managerIds).map(
    (managerId, index) => ({
      reportId,
      managerId,
      sortOrder: index,
    })
  );
  if (values.length === 0) return;

  await db.insert(reportManagers).values(values);
}

export async function syncReportManagers(
  reportId: string,
  managerIds: string[]
): Promise<void> {
  await db.delete(reportManagers).where(eq(reportManagers.reportId, reportId));
  await insertReportManagers(reportId, managerIds);
}
