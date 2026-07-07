import type { UserRole } from "@/lib/auth/roles";
import { canAccessDeletedReport, isReportDeleted } from "@/lib/reports/tombstone";

export type ReportAccessRecord = {
  authorId: string;
  assignedManagerId: string | null;
  assignedManagerIds?: string[] | null;
  status: string;
  deletedAt?: Date | null;
};

/**
 * Whether the user may view a report bundle (read-only or editable).
 * Admins can view all reports including tombstoned; engineers only their own;
 * managers assigned or submitted/in-review queue reports; QA viewers read-only all active reports.
 */
export function canViewReport(
  user: { id: string; role: UserRole },
  report: ReportAccessRecord
): boolean {
  if (isReportDeleted(report) && !canAccessDeletedReport(user)) {
    return false;
  }

  if (user.role === "admin" || user.role === "qa") return true;
  if (user.role === "engineer") return user.id === report.authorId;
  if (user.role === "manager") {
    const assignedManagerIds =
      report.assignedManagerIds && report.assignedManagerIds.length > 0
        ? report.assignedManagerIds
        : report.assignedManagerId
          ? [report.assignedManagerId]
          : [];
    return (
      assignedManagerIds.includes(user.id) ||
      report.status === "submitted" ||
      report.status === "in_review"
    );
  }
  return false;
}

export function canEditReport(
  user: { id: string; role: UserRole },
  report: ReportAccessRecord
): boolean {
  if (user.role === "qa") return false;
  if (isReportDeleted(report)) return false;
  if (report.status === "approved") return false;
  if (user.role === "admin") return true;
  if (user.role === "engineer") return user.id === report.authorId;
  return false;
}

/** Whether the user may upload or delete PDF attachments on this report. */
export function canModifyReportAttachments(
  user: { id: string; role: UserRole },
  report: ReportAccessRecord
): boolean {
  if (user.role === "qa") return false;
  if (isReportDeleted(report)) return false;
  if (report.status === "approved") return false;

  const engineerAuthor = user.role === "engineer" && user.id === report.authorId;
  if (engineerAuthor) {
    return (
      report.status === "draft" ||
      report.status === "feedback" ||
      report.status === "in_review"
    );
  }

  if (user.role === "admin") return true;
  return false;
}
