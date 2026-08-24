import { assignedManagerIdsForReport } from "@/lib/reports/managers";
import type { ReportAccessRecord } from "@/lib/reports/access";

const QUEUE_STATUSES = new Set(["submitted", "in_review"]);

export type ManagerActOptions = {
  /** Hidden expert is always assigned; ignore them when deciding if the queue is open. */
  hiddenExpertUserId?: string | null;
};

/**
 * Whether a manager may approve, return feedback, or comment on a report.
 * Assigned managers always qualify; unassigned queue reports remain open to any manager.
 * The hidden expert reviewer does not by himself close the any-manager queue.
 */
export function canManagerActOnReport(
  managerId: string,
  report: ReportAccessRecord,
  explicitManagerIds: string[] = [],
  options?: ManagerActOptions
): boolean {
  const assignedIds = assignedManagerIdsForReport(report, explicitManagerIds);
  if (assignedIds.includes(managerId)) return true;
  const hiddenExpertUserId = options?.hiddenExpertUserId;
  const visibleAssignedIds = hiddenExpertUserId
    ? assignedIds.filter((id) => id !== hiddenExpertUserId)
    : assignedIds;
  if (visibleAssignedIds.length > 0) return false;
  return QUEUE_STATUSES.has(report.status);
}

export function assertManagerCanActOnReport(
  managerId: string,
  report: ReportAccessRecord,
  explicitManagerIds: string[] = [],
  options?: ManagerActOptions
): { ok: true } | { ok: false; message: string } {
  if (canManagerActOnReport(managerId, report, explicitManagerIds, options)) {
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
