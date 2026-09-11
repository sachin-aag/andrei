import type { UserRole } from "@/lib/auth/roles";
import { isHiddenExpertReviewer } from "@/lib/reports/hidden-expert-reviewer";

export type ReportWorkspaceUser = {
  id: string;
  role: UserRole;
  email?: string | null;
};

/**
 * Direct workspace URL for a report (edit / review / admin), matching
 * `/reports/[reportId]` so the home list does not pay an extra redirect.
 */
export function reportWorkspacePath(
  reportId: string,
  user: ReportWorkspaceUser
): string {
  if (isHiddenExpertReviewer(user)) {
    return `/reports/${reportId}/edit`;
  }
  switch (user.role) {
    case "engineer":
      return `/reports/${reportId}/edit`;
    case "manager":
      return `/reports/${reportId}/review`;
    case "admin":
      return `/admin/reports/${reportId}`;
    case "qa":
      return `/reports/${reportId}/edit`;
    default: {
      const exhaustive: never = user.role;
      return exhaustive;
    }
  }
}
