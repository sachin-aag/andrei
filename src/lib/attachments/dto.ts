import type { reportAttachments } from "@/db/schema";
import type { ReportAttachmentRecord } from "@/types/report";

type AttachmentRow = typeof reportAttachments.$inferSelect;

/** Public DTO — never expose object keys, hashes, CRC, or uploader IDs. */
export function toAttachmentDto(row: AttachmentRow): ReportAttachmentRecord {
  return {
    id: row.id,
    reportId: row.reportId,
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
