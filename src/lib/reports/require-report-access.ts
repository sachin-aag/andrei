import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import {
  canEditReport,
  canMutateAttachments,
  canViewReport,
} from "@/lib/reports/access";
import {
  listReportManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";

export type ReportRow = typeof reports.$inferSelect;
export type ReportWithManagers = ReportRow & { assignedManagerIds: string[] };

export type ReportAccessOk = {
  ok: true;
  user: WorkspaceUser;
  report: ReportWithManagers;
  canView: true;
  canEdit: boolean;
  canMutateAttachments: boolean;
};

export type ReportAccessDenied = {
  ok: false;
  status: 401 | 403 | 404;
  error: string;
};

export type ReportAccessResult = ReportAccessOk | ReportAccessDenied;

/**
 * Canonical loader for report-scoped routes: hydrate manager assignments,
 * then apply canViewReport / canEditReport / canMutateAttachments.
 */
export async function requireReportAccess(
  reportId: string,
  user: WorkspaceUser | null
): Promise<ReportAccessResult> {
  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) {
    return { ok: false, status: 404, error: "Not found" };
  }

  const managerIds = await listReportManagerIds(reportId);
  const reportWithManagers = withAssignedManagerIds(report, managerIds);

  if (!canViewReport(user, reportWithManagers)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    user,
    report: reportWithManagers,
    canView: true,
    canEdit: canEditReport(user, reportWithManagers),
    canMutateAttachments: canMutateAttachments(user, reportWithManagers),
  };
}
