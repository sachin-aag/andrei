import type { ReportAttachmentRecord } from "@/types/report";
import { pdfUploadError, PDF_MIME_TYPE } from "@/lib/attachments/pdf-upload";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function uploadReportPdfAttachment(
  reportId: string,
  file: File
): Promise<ReportAttachmentRecord> {
  const validationError = pdfUploadError(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const mimeType = file.type || PDF_MIME_TYPE;

  const urlRes = await fetch(`/api/reports/${reportId}/attachments/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
    }),
  });

  if (!urlRes.ok) {
    const body = (await urlRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to start upload");
  }

  const { attachmentId, objectKey, uploadUrl } = (await urlRes.json()) as {
    attachmentId: string;
    objectKey: string;
    uploadUrl: string;
  };

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(file.size),
    },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error("Failed to upload PDF to storage");
  }

  const sha256 = await sha256Hex(file);

  const finalizeRes = await fetch(`/api/reports/${reportId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attachmentId,
      objectKey,
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
      sha256,
    }),
  });

  if (!finalizeRes.ok) {
    const body = (await finalizeRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? "Failed to finalize attachment");
  }

  const { attachment } = (await finalizeRes.json()) as {
    attachment: ReportAttachmentRecord;
  };
  return attachment;
}

export async function deleteReportPdfAttachment(
  reportId: string,
  attachmentId: string
): Promise<void> {
  const res = await fetch(
    `/api/reports/${reportId}/attachments/${attachmentId}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to delete attachment");
  }
}
