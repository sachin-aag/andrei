import type { AttachmentProcessingStatus } from "@/db/schema";

const LIVE_INGEST_STATUSES = new Set<AttachmentProcessingStatus>([
  "validating",
  "queued",
  "processing",
]);

export function reportProcessingForLinkedAsset(asset: {
  activeIngestRunId: string | null;
  gcsGeneration: string | null;
  processingStatus: AttachmentProcessingStatus;
}): {
  processingStatus: AttachmentProcessingStatus;
  shouldStartIngest: boolean;
} {
  if (asset.activeIngestRunId && asset.processingStatus === "ready") {
    return {
      processingStatus: "ready",
      shouldStartIngest: false,
    };
  }

  const liveIngest =
    Boolean(asset.activeIngestRunId) &&
    LIVE_INGEST_STATUSES.has(asset.processingStatus);

  if (liveIngest) {
    return {
      processingStatus: asset.processingStatus,
      shouldStartIngest: false,
    };
  }

  return { processingStatus: "queued", shouldStartIngest: true };
}
