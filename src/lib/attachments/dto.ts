import type { reportAttachmentFolders, reportAttachments } from "@/db/schema";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";

type AttachmentRow = typeof reportAttachments.$inferSelect;
type FolderRow = typeof reportAttachmentFolders.$inferSelect;

/** Public DTO — never expose object keys, hashes, CRC, or uploader IDs. */
export function toAttachmentDto(row: AttachmentRow): ReportAttachmentRecord {
  return {
    id: row.id,
    reportId: row.reportId,
    folderId: row.folderId,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    processingStatus: row.processingStatus,
    processingProgress: row.processingProgress,
    processingError: row.processingError,
    uploadedAt:
      row.uploadedAt instanceof Date
        ? row.uploadedAt.toISOString()
        : String(row.uploadedAt),
    deletedAt:
      row.deletedAt == null
        ? null
        : row.deletedAt instanceof Date
          ? row.deletedAt.toISOString()
          : String(row.deletedAt),
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
