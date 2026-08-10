import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import {
  requireReportAccess,
  type ReportWithManagers,
} from "@/lib/reports/require-report-access";

/** Loads a report the user may view, or null. `canEdit` follows canEditReport. */
export async function loadAccessibleReport(
  reportId: string,
  user: WorkspaceUser
): Promise<{ report: ReportWithManagers; canEdit: boolean } | null> {
  const access = await requireReportAccess(reportId, user);
  if (!access.ok) return null;
  return { report: access.report, canEdit: access.canEdit };
}
