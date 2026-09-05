import type {
  attachmentAssets,
  reportAttachmentFolders,
  reportAttachments,
} from "@/db/schema";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";
import { resolveAttachmentFields } from "@/lib/attachments/resolve-attachment";

type AttachmentRow = typeof reportAttachments.$inferSelect;
type AssetRow = typeof attachmentAssets.$inferSelect;
type FolderRow = typeof reportAttachmentFolders.$inferSelect;

/** Public DTO — never expose object keys, hashes, CRC, or uploader IDs. */
export function toAttachmentDto(
  row: AttachmentRow,
  asset?: AssetRow | null
): ReportAttachmentRecord {
  const resolved = resolveAttachmentFields(row, asset);
  return {
    id: row.id,
    reportId: row.reportId,
    folderId: row.folderId,
    assetId: row.assetId ?? null,
    filename: resolved.filename,
    description: resolved.description ?? null,
    mimeType: resolved.mimeType,
    sizeBytes: resolved.sizeBytes,
    pageCount: resolved.pageCount,
    processingStatus: resolved.processingStatus,
    processingProgress: resolved.processingProgress,
    processingPage: resolved.processingPage ?? null,
    processingError: resolved.processingError,
    uploadedAt:
      resolved.uploadedAt instanceof Date
        ? resolved.uploadedAt.toISOString()
        : String(resolved.uploadedAt),
    deletedAt:
      resolved.deletedAt == null
        ? null
        : resolved.deletedAt instanceof Date
          ? resolved.deletedAt.toISOString()
          : String(resolved.deletedAt),
  };
}

export function toAttachmentFolderDto(
  row: FolderRow
): ReportAttachmentFolderRecord {
  return {
    id: row.id,
    reportId: row.reportId,
    parentId: row.parentId,
    name: row.name,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}
