import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { listAttachmentFolders } from "@/lib/attachments/folders";
import {
  attachmentsZipFileName,
  buildAttachmentZipEntries,
  type ZipAttachmentInput,
} from "@/lib/attachments/zip-entry-paths";
import { createAttachmentsZipStream } from "@/lib/attachments/zip-stream";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export async function listDownloadableAttachmentSources(
  reportId: string
): Promise<ZipAttachmentInput[]> {
  const rows = await db
    .select({
      id: reportAttachments.id,
      filename: reportAttachments.filename,
      folderId: reportAttachments.folderId,
      permanentObjectKey: reportAttachments.permanentObjectKey,
      gcsGeneration: reportAttachments.gcsGeneration,
    })
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    )
    .orderBy(asc(reportAttachments.uploadedAt));

  return rows.flatMap((row) => {
    if (!row.gcsGeneration) return [];
    return [
      {
        id: row.id,
        filename: row.filename,
        folderId: row.folderId,
        objectKey: row.permanentObjectKey,
      },
    ];
  });
}

export async function loadAttachmentsDownloadZip(
  reportId: string,
  documentNo: string
): Promise<{ stream: ReadableStream<Uint8Array>; filename: string } | null> {
  const [folders, sources] = await Promise.all([
    listAttachmentFolders(reportId),
    listDownloadableAttachmentSources(reportId),
  ]);
  if (sources.length === 0) return null;

  const entries = buildAttachmentZipEntries(folders, sources);
  const storage = getAttachmentStorage();
  return {
    stream: createAttachmentsZipStream(
      entries.map((entry) => ({
        zipPath: entry.zipPath,
        open: () => storage.openObjectReadStream(entry.objectKey),
      }))
    ),
    filename: attachmentsZipFileName(documentNo),
  };
}
