import type { UserRole } from "@/lib/auth/roles";

export type ReportAccessRecord = {
  authorId: string;
  assignedManagerId: string | null;
  status: string;
};

/**
 * Whether the user may view a report bundle (read-only or editable).
 * Admins can view all reports; engineers only their own; managers assigned
 * or submitted/in-review queue reports.
 */
export function canViewReport(
  user: { id: string; role: UserRole },
  report: ReportAccessRecord
): boolean {
  if (user.role === "admin") return true;
  if (user.role === "engineer") return user.id === report.authorId;
  if (user.role === "manager") {
    return (
      report.assignedManagerId === user.id ||
      report.status === "submitted" ||
      report.status === "in_review"
    );
  }
  return false;
}
