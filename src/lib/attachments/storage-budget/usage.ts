import { and, isNull, ne, sql } from "drizzle-orm";
import { attachmentAssets, reportAttachments } from "@/db/schema";

type SelectClient = {
  select: (typeof import("@/db").db)["select"];
};

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Stored attachment bytes that still occupy the workspace quota.
 * Counts each library asset once (including in-flight uploads and archived
 * vault files). Failed rows do not count. Legacy report rows without an asset
 * are added separately so they are not missed. Linking a vault file into a
 * report does not count twice.
 */
export async function getAttachmentStorageUsageBytes(
  client?: SelectClient
): Promise<number> {
  const db = client ?? (await import("@/db")).db;
  const [assetRow] = await db
    .select({
      total: sql<string>`coalesce(sum(${attachmentAssets.sizeBytes}::bigint), 0)`,
    })
    .from(attachmentAssets)
    .where(ne(attachmentAssets.processingStatus, "failed"));
  const [legacyRow] = await db
    .select({
      total: sql<string>`coalesce(sum(${reportAttachments.sizeBytes}::bigint), 0)`,
    })
    .from(reportAttachments)
    .where(
      and(
        isNull(reportAttachments.deletedAt),
        isNull(reportAttachments.assetId),
        ne(reportAttachments.processingStatus, "failed")
      )
    );

  return asNumber(assetRow?.total) + asNumber(legacyRow?.total);
}
