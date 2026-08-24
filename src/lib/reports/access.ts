import type { UserRole } from "@/lib/auth/roles";
import { isHiddenExpertReviewer } from "@/lib/reports/hidden-expert-reviewer";
import { canAccessDeletedReport, isReportDeleted } from "@/lib/reports/tombstone";

export type ReportAccessUser = {
  id: string;
  role: UserRole;
  email?: string | null;
};

export type ReportAccessRecord = {
  authorId: string;
  assignedManagerId: string | null;
  assignedManagerIds?: string[] | null;
  status: string;
  deletedAt?: Date | null;
};

function isLiveHiddenExpert(user: ReportAccessUser): boolean {
  return user.role === "manager" && isHiddenExpertReviewer(user);
}

/**
 * Whether the user may view a report bundle (read-only or editable).
 * Admins can view all reports including tombstoned; engineers only their own;
 * managers assigned or submitted/in-review queue reports; QA viewers read-only all active reports.
 */
export function canViewReport(
  user: ReportAccessUser,
  report: ReportAccessRecord
): boolean {
  if (isReportDeleted(report) && !canAccessDeletedReport(user)) {
    return false;
  }

  if (isLiveHiddenExpert(user)) return true;
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
  user: ReportAccessUser,
  report: ReportAccessRecord
): boolean {
  if (user.role === "qa") return false;
  if (isReportDeleted(report)) return false;
  if (report.status === "approved") return false;
  if (isLiveHiddenExpert(user)) return true;
  if (user.role === "admin") return true;
  if (user.role === "engineer") return user.id === report.authorId;
  return false;
}

/**
 * Whether the user may PATCH section content.
 * Engineers (author) may save in draft / feedback / in_review.
 * Managers may save while the report is submitted or in_review (track changes).
 * Submitted author edits are blocked — content is locked until feedback.
 */
export function canSaveReportSection(
  user: ReportAccessUser,
  report: Pick<ReportAccessRecord, "authorId" | "status" | "deletedAt">
): boolean {
  if (isReportDeleted(report)) return false;

  if (isLiveHiddenExpert(user)) {
    return report.status !== "approved";
  }

  if (user.role === "engineer" && user.id === report.authorId) {
    return (
      report.status === "draft" ||
      report.status === "feedback" ||
      report.status === "in_review"
    );
  }

  if (user.role === "manager") {
    return report.status === "submitted" || report.status === "in_review";
  }

  return false;
}

/** Why AI Suggest fixes / agent proposals are blocked, or null when allowed. */
export function aiSuggestionLockReason(
  user: ReportAccessUser,
  report: Pick<ReportAccessRecord, "authorId" | "status" | "deletedAt">
): string | null {
  if (canSaveReportSection(user, report)) return null;
  if (report.status === "submitted") {
    return "This report is already submitted. Editing unlocks after it's returned with feedback.";
  }
  if (report.status === "approved") {
    return "This report is approved and locked.";
  }
  return "You can't propose edits on this report right now.";
}

/**
 * Attachment mutations are allowed only while the evidence set is still
 * mutable: active draft/feedback reports, for users who may otherwise edit.
 * Submitted / in-review / approved evidence is immutable.
 */
export function canMutateAttachments(
  user: ReportAccessUser,
  report: ReportAccessRecord
): boolean {
  if (!canEditReport(user, report)) return false;
  return report.status === "draft" || report.status === "feedback";
}
