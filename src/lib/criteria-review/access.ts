import type { WorkspaceUser } from "@/lib/auth/workspace-user";

/** Criteria review is an internal QA tool; managers and engineers may access when enabled. */
export function canAccessCriteriaReview(user: WorkspaceUser): boolean {
  if (process.env.CRITERIA_REVIEW_DISABLED === "true") return false;
  if (process.env.CRITERIA_REVIEW_MANAGERS_ONLY === "true") {
    return user.role === "manager";
  }
  return true;
}
