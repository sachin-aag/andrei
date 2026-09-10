import type { attachmentAssets, reportAttachments } from "@/db/schema";

type AttachmentRow = typeof reportAttachments.$inferSelect;
type AssetRow = typeof attachmentAssets.$inferSelect;

export type ResolvedAttachmentFields = Pick<
  AttachmentRow,
  | "filename"
  | "description"
  | "mimeType"
  | "sizeBytes"
  | "pageCount"
  | "processingStatus"
  | "processingProgress"
  | "processingPage"
  | "processingError"
  | "sha256"
  | "stagingObjectKey"
  | "permanentObjectKey"
  | "gcsGeneration"
  | "crc32c"
  | "activeIngestRunId"
  | "uploadedAt"
  | "deletedAt"
>;

/**
 * When a report link points at a library asset, ingest/storage fields come from
 * the asset. Report-specific filename/description overrides stay on the link.
 */
export function resolveAttachmentFields(
  row: AttachmentRow,
  asset?: AssetRow | null
): ResolvedAttachmentFields {
  if (!asset) {
    return {
      filename: row.filename,
      description: row.description,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      pageCount: row.pageCount,
      processingStatus: row.processingStatus,
      processingProgress: row.processingProgress,
      processingPage: row.processingPage,
      processingError: row.processingError,
      sha256: row.sha256,
      stagingObjectKey: row.stagingObjectKey,
      permanentObjectKey: row.permanentObjectKey,
      gcsGeneration: row.gcsGeneration,
      crc32c: row.crc32c,
      activeIngestRunId: row.activeIngestRunId,
      uploadedAt: row.uploadedAt,
      deletedAt: row.deletedAt,
    };
  }

  return {
    filename: row.filename,
    description: row.description ?? asset.description,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    pageCount: asset.pageCount,
    processingStatus: asset.processingStatus,
    processingProgress: asset.processingProgress,
    processingPage: asset.processingPage,
    processingError: asset.processingError,
    sha256: asset.sha256,
    stagingObjectKey: asset.stagingObjectKey,
    permanentObjectKey: asset.permanentObjectKey,
    gcsGeneration: asset.gcsGeneration,
    crc32c: asset.crc32c,
    activeIngestRunId: asset.activeIngestRunId,
    uploadedAt: asset.uploadedAt,
    deletedAt: row.deletedAt ?? asset.deletedAt,
  };
}

export function storageSourceForAttachment(
  row: AttachmentRow,
  asset?: AssetRow | null
): Pick<
  ResolvedAttachmentFields,
  | "stagingObjectKey"
  | "permanentObjectKey"
  | "gcsGeneration"
  | "crc32c"
  | "sha256"
  | "mimeType"
  | "sizeBytes"
  | "processingStatus"
  | "activeIngestRunId"
> {
  const resolved = resolveAttachmentFields(row, asset);
  return {
    stagingObjectKey: resolved.stagingObjectKey,
    permanentObjectKey: resolved.permanentObjectKey,
    gcsGeneration: resolved.gcsGeneration,
    crc32c: resolved.crc32c,
    sha256: resolved.sha256,
    mimeType: resolved.mimeType,
    sizeBytes: resolved.sizeBytes,
    processingStatus: resolved.processingStatus,
    activeIngestRunId: resolved.activeIngestRunId,
  };
}
