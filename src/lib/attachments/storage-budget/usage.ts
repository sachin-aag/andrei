import { and, eq, exists, isNull, ne, or, sql } from "drizzle-orm";
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
 * Counts each library asset once (including in-flight uploads). Soft-deleted
 * library files still count while a report keeps a live link. Failed rows and
 * fully removed files do not count. Legacy report rows without an asset are
 * added separately so they are not missed.
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
    .where(
      and(
        ne(attachmentAssets.processingStatus, "failed"),
        or(
          isNull(attachmentAssets.deletedAt),
          exists(
            db
              .select({ id: reportAttachments.id })
              .from(reportAttachments)
              .where(
                and(
                  eq(reportAttachments.assetId, attachmentAssets.id),
                  isNull(reportAttachments.deletedAt)
                )
              )
          )
        )
      )
    );
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
