import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachmentIngestRuns, reportAttachments } from "@/db/schema";
import {
  isStaleIngest,
  RECLAIMABLE_STATUSES,
  STALE_INGEST_MESSAGE,
  STALE_INGEST_MS,
} from "@/lib/attachments/stale-ingest-policy";

export {
  isStaleIngest,
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
 * Safe to call from read paths: it only touches rows whose last activity is
 * older than {@link STALE_INGEST_MS}.
 */
export async function reclaimStaleIngests(
  reportId: string,
  now: Date = new Date()
): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_INGEST_MS);

  const candidates = await db
    .select({
      id: reportAttachments.id,
      processingStatus: reportAttachments.processingStatus,
      uploadedAt: reportAttachments.uploadedAt,
      lastRunAt: max(
        sql`coalesce(${attachmentIngestRuns.startedAt}, ${attachmentIngestRuns.createdAt})`
      ),
    })
    .from(reportAttachments)
    .leftJoin(
      attachmentIngestRuns,
      eq(attachmentIngestRuns.attachmentId, reportAttachments.id)
    )
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt),
        inArray(reportAttachments.processingStatus, [...RECLAIMABLE_STATUSES]),
        // Cheap prefilter: a run can never predate its attachment's upload.
        sql`${reportAttachments.uploadedAt} < ${cutoff}`
      )
    )
    .groupBy(
      reportAttachments.id,
      reportAttachments.processingStatus,
      reportAttachments.uploadedAt
    );

  const staleIds = candidates
    .filter((row) =>
      isStaleIngest(
        {
          processingStatus: row.processingStatus,
          lastActivityAt: toDate(row.lastRunAt) ?? row.uploadedAt,
        },
        now
      )
    )
    .map((row) => row.id);

  if (staleIds.length === 0) return 0;

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
          inArray(attachmentIngestRuns.attachmentId, staleIds),
          inArray(attachmentIngestRuns.status, [...OPEN_RUN_STATUSES])
        )
      );

    await tx
      .update(reportAttachments)
      .set({
        processingStatus: "failed",
        processingProgress: FAILED_ATTACHMENT_PROGRESS,
        processingPage: null,
        processingError: STALE_INGEST_MESSAGE,
      })
      .where(
        and(
          inArray(reportAttachments.id, staleIds),
          inArray(reportAttachments.processingStatus, [...RECLAIMABLE_STATUSES])
        )
      );
  });

  console.warn("[document-ingest] Reclaimed stale ingests", {
    reportId,
    attachmentIds: staleIds,
  });
  return staleIds.length;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
