import { sql } from "drizzle-orm";
import {
  reports,
  type ReportMetadata,
} from "@/db/schema";

export const CREATE_PRELOAD_DOCUMENT_NO_PREFIX = "__preload_";

export type CreatePreloadMetadata = {
  createPreload: true;
};

export function createPreloadDocumentNo(reportId: string): string {
  return `${CREATE_PRELOAD_DOCUMENT_NO_PREFIX}${reportId}`;
}

export function isCreatePreloadDocumentNo(documentNo: string): boolean {
  return documentNo.startsWith(CREATE_PRELOAD_DOCUMENT_NO_PREFIX);
}

export function isCreatePreloadMetadata(
  metadata: ReportMetadata | null | undefined
): metadata is ReportMetadata & CreatePreloadMetadata {
  return (
    metadata != null &&
    typeof metadata === "object" &&
    "createPreload" in metadata &&
    metadata.createPreload === true
  );
}

export function stripCreatePreloadMetadata(
  metadata: ReportMetadata | null | undefined
): ReportMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const next = { ...metadata } as Record<string, unknown>;
  delete next.createPreload;
  return next;
}

/** Exclude unfinished create-dialog preloads from dashboards and lists. */
export function excludeCreatePreloadReportsFilter() {
  return sql`coalesce(${reports.metadata}->>'createPreload', 'false') <> 'true'`;
}
