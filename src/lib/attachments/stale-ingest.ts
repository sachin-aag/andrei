import { and, eq, inArray, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachmentAssets,
  attachmentIngestRuns,
  reportAttachments,
} from "@/db/schema";
import {
  isStaleIngest,
  lastActivityForStaleReclaim,
  RECLAIMABLE_STATUSES,
  STALE_INGEST_MESSAGE,
  STALE_INGEST_MS,
} from "@/lib/attachments/stale-ingest-policy";

export {
  isStaleIngest,
  lastActivityForStaleReclaim,
  STALE_INGEST_MESSAGE,
  STALE_INGEST_MS,
} from "@/lib/attachments/stale-ingest-policy";

const OPEN_RUN_STATUSES = ["pending", "running"] as const;

/** Progress value that marks a failed attachment, mirroring run-document-ingest. */
const FAILED_ATTACHMENT_PROGRESS = 0;

/**
 * Fail ingests that no executor is working on anymore, so the UI stops
 * spinning and the reprocess action becomes available.
 *
 * Safe to call from read paths: it only touches rows whose last ingest-run
 * activity is older than {@link STALE_INGEST_MS}. Never-started leftovers
 * (no run row) are left for the leftover-ingest kick, not cancelled.
 * Vault links join runs by attachment or shared asset so a live holder
 * ingest is not treated as dead.
 */
export async function reclaimStaleIngests(
  reportId: string,
  now: Date = new Date()
): Promise<number> {
  const candidates = await db
    .select({
      id: reportAttachments.id,
      assetId: reportAttachments.assetId,
      processingStatus: reportAttachments.processingStatus,
      uploadedAt: reportAttachments.uploadedAt,
      lastRunAt: max(
        sql`coalesce(${attachmentIngestRuns.startedAt}, ${attachmentIngestRuns.createdAt})`
      ),
    })
    .from(reportAttachments)
    .leftJoin(
      attachmentIngestRuns,
      and(
        inArray(attachmentIngestRuns.status, [...OPEN_RUN_STATUSES]),
        or(
          eq(attachmentIngestRuns.attachmentId, reportAttachments.id),
          and(
            isNotNull(reportAttachments.assetId),
            eq(attachmentIngestRuns.assetId, reportAttachments.assetId)
          )
        )
      )
    )
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt),
        inArray(reportAttachments.processingStatus, [...RECLAIMABLE_STATUSES])
      )
    )
    .groupBy(
      reportAttachments.id,
      reportAttachments.assetId,
      reportAttachments.processingStatus,
      reportAttachments.uploadedAt
    );

  const stale = candidates.filter((row) =>
    isStaleIngest(
      {
        processingStatus: row.processingStatus,
        lastActivityAt:
          lastActivityForStaleReclaim(toDate(row.lastRunAt)) ??
          (row.assetId == null ? row.uploadedAt : null),
      },
      now
    )
  );
  const staleIds = stale.map((row) => row.id);
  const staleAssetIds = [
    ...new Set(
      stale
        .map((row) => row.assetId)
        .filter((id): id is string => id != null)
    ),
  ];

  if (staleIds.length === 0) return 0;

  const failPatch = {
    processingStatus: "failed" as const,
    processingProgress: FAILED_ATTACHMENT_PROGRESS,
    processingPage: null,
    processingError: STALE_INGEST_MESSAGE,
  };

  await db.transaction(async (tx) => {
    await tx
      .update(attachmentIngestRuns)
      .set({
        status: "failed",
        error: STALE_INGEST_MESSAGE,
        completedAt: now,
      })
      .where(
        and(
          inArray(attachmentIngestRuns.status, [...OPEN_RUN_STATUSES]),
          or(
            inArray(attachmentIngestRuns.attachmentId, staleIds),
            staleAssetIds.length > 0
              ? inArray(attachmentIngestRuns.assetId, staleAssetIds)
              : sql`false`
          )
        )
      );

    await tx
      .update(reportAttachments)
      .set(failPatch)
      .where(
        and(
          inArray(reportAttachments.id, staleIds),
          inArray(reportAttachments.processingStatus, [...RECLAIMABLE_STATUSES])
        )
      );

    if (staleAssetIds.length > 0) {
      await tx
        .update(attachmentAssets)
        .set(failPatch)
        .where(
          and(
            inArray(attachmentAssets.id, staleAssetIds),
            inArray(attachmentAssets.processingStatus, [
              ...RECLAIMABLE_STATUSES,
            ])
          )
        );
    }
  });

  console.warn("[document-ingest] Reclaimed stale ingests", {
    reportId,
    attachmentIds: staleIds,
  });
  return staleIds.length;
}

/**
 * Fail abandoned `pending`/`running` runs for one vault asset so a new
 * holder ingest can start. Does not mark the asset failed — never-started
 * leftovers must be kicked, not cancelled.
 */
export async function failStaleOpenIngestRunsForAsset(
  assetId: string,
  now: Date = new Date()
): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_INGEST_MS);
  const staleRuns = await db
    .select({ id: attachmentIngestRuns.id })
    .from(attachmentIngestRuns)
    .where(
      and(
        eq(attachmentIngestRuns.assetId, assetId),
        inArray(attachmentIngestRuns.status, [...OPEN_RUN_STATUSES]),
        sql`coalesce(${attachmentIngestRuns.startedAt}, ${attachmentIngestRuns.createdAt}) < ${cutoff}`
      )
    );
  if (staleRuns.length === 0) return 0;

  await db
    .update(attachmentIngestRuns)
    .set({
      status: "failed",
      error: STALE_INGEST_MESSAGE,
      completedAt: now,
    })
    .where(
      inArray(
        attachmentIngestRuns.id,
        staleRuns.map((row) => row.id)
      )
    );
  return staleRuns.length;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
