import { isNull, type SQL } from "drizzle-orm";
import { reports } from "@/db/schema";

export function activeReportsFilter(): SQL {
  return isNull(reports.deletedAt);
}

export function isReportDeleted(
  report: { deletedAt?: Date | null | undefined }
): boolean {
  return report.deletedAt != null;
}

export function canAccessDeletedReport(user: { role: string }): boolean {
  return user.role === "admin";
}
