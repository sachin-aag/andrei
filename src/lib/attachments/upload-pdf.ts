import {
  canonicalAttachmentMime,
  isSupportedAttachment,
} from "@/lib/attachments/file-types";
import { uploadPdfResumable } from "@/lib/attachments/upload-client";
import type { ReportAttachmentRecord } from "@/types/report";

export type UploadByteProgress = {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
};

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" && file.name.toLowerCase().endsWith(".pdf")
  );
}

/** Accepts the supported evidence-attachment types: PDF and Word `.docx`. */
export function isSupportedAttachmentFile(file: File): boolean {
  return isSupportedAttachment({ filename: file.name, mimeType: file.type });
}

/** Canonical MIME to reserve/PUT with; falls back to the browser's type. */
export function attachmentUploadMime(file: File): string {
  return (
    canonicalAttachmentMime({ filename: file.name, mimeType: file.type }) ??
    file.type
  );
}

/** Reserves the attachment row and a resumable upload URL. Throws on failure. */
export async function reserveAttachmentUpload({
  reportId,
  file,
  folderId,
}: {
  reportId: string;
  file: File;
  folderId: string | null;
}): Promise<{ attachmentId: string; uploadUrl: string }> {
  const response = await fetch(
    `/api/reports/${reportId}/attachments/upload-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        mimeType: attachmentUploadMime(file),
        sizeBytes: file.size,
        folderId,
      }),
    }
  );
  const data = (await response.json().catch(() => ({}))) as {
    attachmentId?: string;
    uploadUrl?: string;
    error?: string;
  };
  if (!response.ok || !data.attachmentId || !data.uploadUrl) {
    throw new Error(data.error ?? `Could not start upload for ${file.name}`);
  }
  return { attachmentId: data.attachmentId, uploadUrl: data.uploadUrl };
}

/** Validates, scans, and promotes the staged bytes. Throws on failure. */
export async function finalizeAttachmentUpload({
  reportId,
  attachmentId,
  filename,
}: {
  reportId: string;
  attachmentId: string;
  filename: string;
}): Promise<ReportAttachmentRecord> {
  const response = await fetch(
    `/api/reports/${reportId}/attachments/${attachmentId}/finalize`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
  const data = (await response.json().catch(() => ({}))) as {
    attachment?: ReportAttachmentRecord;
    error?: string;
  };
  if (!response.ok || !data.attachment) {
    throw new Error(data.error ?? `Could not finalize ${filename}`);
  }
  return data.attachment;
}

/**
 * Full reserve → PUT → finalize sequence for callers that don't need the
 * attachment id before the bytes go up (e.g. the create-report dialog).
 */
export async function uploadPdfToReport({
  reportId,
  file,
  folderId = null,
  onProgress,
}: {
  reportId: string;
  file: File;
  folderId?: string | null;
  onProgress?: (progress: UploadByteProgress) => void;
}): Promise<ReportAttachmentRecord> {
  const { attachmentId, uploadUrl } = await reserveAttachmentUpload({
    reportId,
    file,
    folderId,
  });

  try {
    await uploadPdfResumable({
      uploadUrl,
      file,
      contentType: attachmentUploadMime(file),
      onProgress: ({ uploadedBytes, totalBytes }) => {
        onProgress?.({
          uploadedBytes,
          totalBytes,
          percent: totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0,
        });
      },
    });

    return await finalizeAttachmentUpload({
      reportId,
      attachmentId,
      filename: file.name,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Could not upload ${file.name}`;
    await fetch(`/api/reports/${reportId}/attachments/${attachmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadFailed: true, error: message }),
    }).catch(() => undefined);
    throw error instanceof Error ? error : new Error(message);
  }
}
