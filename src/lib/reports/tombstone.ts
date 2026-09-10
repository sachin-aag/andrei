import { isNull, type SQL } from "drizzle-orm";
import { and } from "drizzle-orm";
import { reports } from "@/db/schema";
import { excludeVaultIngestHolderReportsFilter } from "@/lib/reports/vault-ingest-holder";

export function activeReportsFilter(): SQL {
  return isNull(reports.deletedAt);
}

/** Live reports shown in dashboards and engineer/manager lists. */
export function visibleReportsFilter(): SQL {
  return and(activeReportsFilter(), excludeVaultIngestHolderReportsFilter())!;
}

export function isReportDeleted(
  report: { deletedAt?: Date | null | undefined }
): boolean {
  return report.deletedAt != null;
}

export function canAccessDeletedReport(user: { role: string }): boolean {
  return user.role === "admin";
}
