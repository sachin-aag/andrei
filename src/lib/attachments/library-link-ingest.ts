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

/**
 * Documents-panel poll / report open: start ingest for leftover vault
 * links. `ready` is indexed. In-flight statuses are still kicked so a
 * stuck uploading/processing row with no live run can recover; the
 * start path no-ops when an open ingest run already exists.
 */
export function linkedVaultDtoNeedsIngest(
  processingStatus: AttachmentProcessingStatus
): boolean {
  return processingStatus !== "ready";
}

export type VaultIngestHolderLink =
  | { action: "use" | "restore"; id: string }
  | { action: "insert" };

/**
 * Holder ingest rows use the same unique (report, asset) pair as real
 * report links. Restore a tombstone instead of inserting a second row.
 */
export function resolveVaultIngestHolderLink(
  existing: { id: string; deletedAt: Date | string | null } | null
): VaultIngestHolderLink {
  if (!existing) return { action: "insert" };
  if (existing.deletedAt == null) return { action: "use", id: existing.id };
  return { action: "restore", id: existing.id };
}
