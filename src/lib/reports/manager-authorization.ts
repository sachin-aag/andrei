import { assignedManagerIdsForReport } from "@/lib/reports/managers";
import type { ReportAccessRecord } from "@/lib/reports/access";

const QUEUE_STATUSES = new Set(["submitted", "in_review"]);

/**
 * Whether a manager may approve, return feedback, or comment on a report.
 * Assigned managers always qualify; unassigned queue reports remain open to any manager.
 */
export function canManagerActOnReport(
  managerId: string,
  report: ReportAccessRecord,
  explicitManagerIds: string[] = []
): boolean {
  const assignedIds = assignedManagerIdsForReport(report, explicitManagerIds);
  if (assignedIds.length > 0) {
    return assignedIds.includes(managerId);
  }
  return QUEUE_STATUSES.has(report.status);
}

export function assertManagerCanActOnReport(
  managerId: string,
  report: ReportAccessRecord,
  explicitManagerIds: string[] = []
): { ok: true } | { ok: false; message: string } {
  if (canManagerActOnReport(managerId, report, explicitManagerIds)) {
    return { ok: true };
  }
  return {
    ok: false,
    message: "You are not assigned as a reviewer for this report.",
  };
}

export function assertSegregationOfDutiesForApproval(
  approverId: string,
  reviewedById: string | null | undefined
): { ok: true } | { ok: false; message: string } {
  if (reviewedById && reviewedById === approverId) {
    return {
      ok: false,
      message:
        "The reviewing manager cannot also approve this report (segregation of duties).",
    };
  }
  return { ok: true };
}
