/**
 * When an in-flight ingest should be considered abandoned.
 * Keep free of db imports so unit tests stay light.
 */

import type { AttachmentProcessingStatus } from "@/db/schema";

/**
 * A serverless ingest can die mid-run (function timeout, instance recycle)
 * without ever writing a terminal status, leaving the attachment pinned to
 * `processing` and ineligible for reprocessing. Nothing older than this
 * window still has a live executor behind it.
 */
export const STALE_INGEST_MS = 30 * 60 * 1000;

export const STALE_INGEST_MESSAGE =
  "Document ingestion stopped responding and was cancelled. Reprocess the attachment to try again.";

/** Statuses that mean "ingest is supposed to be running right now". */
export const RECLAIMABLE_STATUSES = [
  "validating",
  "queued",
  "processing",
] as const satisfies readonly AttachmentProcessingStatus[];

export type StaleIngestCandidate = {
  processingStatus: AttachmentProcessingStatus;
  /** Most recent evidence that something was still working on this attachment. */
  lastActivityAt: Date | null;
};

export function isStaleIngest(
  candidate: StaleIngestCandidate,
  now: Date,
  staleMs: number = STALE_INGEST_MS
): boolean {
  const reclaimable: readonly string[] = RECLAIMABLE_STATUSES;
  if (!reclaimable.includes(candidate.processingStatus)) return false;
  if (!candidate.lastActivityAt) return false;
  return now.getTime() - candidate.lastActivityAt.getTime() > staleMs;
}
