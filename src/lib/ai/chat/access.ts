import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

type ReportRow = typeof reports.$inferSelect;

export function canAccessReport(user: WorkspaceUser, report: ReportRow): boolean {
  if (user.id === report.authorId) return true;
  if (report.assignedManagerId && report.assignedManagerId === user.id) return true;
  return user.role === "admin" || user.role === "qa" || user.role === "manager";
}

/** Loads a report the user may access, or null. Editing is blocked once approved. */
export async function loadAccessibleReport(
  reportId: string,
  user: WorkspaceUser
): Promise<{ report: ReportRow; canEdit: boolean } | null> {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return null;
  if (!canAccessReport(user, report)) return null;
  return { report, canEdit: report.status !== "approved" };
}
