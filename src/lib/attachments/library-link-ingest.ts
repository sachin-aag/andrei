import type { AttachmentProcessingStatus } from "@/db/schema";

export function reportProcessingForLinkedAsset(asset: {
  activeIngestRunId: string | null;
  gcsGeneration: string | null;
  processingStatus: AttachmentProcessingStatus;
}): {
  processingStatus: AttachmentProcessingStatus;
  shouldStartIngest: boolean;
} {
  if (asset.activeIngestRunId) {
    return {
      processingStatus: asset.processingStatus,
      shouldStartIngest: false,
    };
  }

  const inFlight =
    asset.processingStatus === "validating" ||
    asset.processingStatus === "queued" ||
    asset.processingStatus === "processing";

  if (inFlight) {
    return {
      processingStatus: asset.processingStatus,
      shouldStartIngest: false,
    };
  }

  const needsIngest =
    Boolean(asset.gcsGeneration) && asset.processingStatus === "ready";

  return {
    processingStatus: needsIngest ? "queued" : asset.processingStatus,
    shouldStartIngest: needsIngest,
  };
}
