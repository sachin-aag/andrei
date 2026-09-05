import type { AttachmentProcessingStatus } from "@/db/schema";

export function reportProcessingForLinkedAsset(asset: {
  activeIngestRunId: string | null;
  gcsGeneration: string | null;
  processingStatus: AttachmentProcessingStatus;
}): {
  processingStatus: AttachmentProcessingStatus;
  shouldStartIngest: boolean;
} {
  const needsIngest =
    !asset.activeIngestRunId &&
    Boolean(asset.gcsGeneration) &&
    (asset.processingStatus === "ready" || asset.processingStatus === "queued");
  return {
    processingStatus: needsIngest ? "queued" : asset.processingStatus,
    shouldStartIngest: needsIngest,
  };
}
