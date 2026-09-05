import {
  attachmentUploadMime,
  isSupportedAttachmentFile,
  type UploadByteProgress,
} from "@/lib/attachments/upload-pdf";
import { uploadPdfResumable } from "@/lib/attachments/upload-client";
import type { AttachmentLibraryAssetRecord } from "@/lib/attachments/library-dto";

export async function reserveLibraryUpload({
  file,
  libraryFolderId,
  relativePath,
}: {
  file: File;
  libraryFolderId: string | null;
  relativePath?: string;
}): Promise<{ assetId: string; uploadUrl: string }> {
  const response = await fetch("/api/attachment-library/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: attachmentUploadMime(file),
      sizeBytes: file.size,
      libraryFolderId,
      relativePath,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    assetId?: string;
    uploadUrl?: string;
    error?: string;
  };
  if (!response.ok || !data.assetId || !data.uploadUrl) {
    throw new Error(data.error ?? `Could not start upload for ${file.name}`);
  }
  return { assetId: data.assetId, uploadUrl: data.uploadUrl };
}

export async function finalizeLibraryUpload({
  assetId,
  filename,
}: {
  assetId: string;
  filename: string;
}): Promise<AttachmentLibraryAssetRecord> {
  const response = await fetch(`/api/attachment-library/${assetId}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = (await response.json().catch(() => ({}))) as {
    asset?: AttachmentLibraryAssetRecord;
    error?: string;
  };
  if (!response.ok || !data.asset) {
    throw new Error(data.error ?? `Could not finalize ${filename}`);
  }
  return data.asset;
}

export async function uploadFileToLibrary({
  file,
  libraryFolderId = null,
  relativePath,
  onProgress,
}: {
  file: File;
  libraryFolderId?: string | null;
  relativePath?: string;
  onProgress?: (progress: UploadByteProgress) => void;
}): Promise<AttachmentLibraryAssetRecord> {
  if (!isSupportedAttachmentFile(file)) {
    throw new Error("Only PDF and Word (.docx) files are allowed");
  }

  const { assetId, uploadUrl } = await reserveLibraryUpload({
    file,
    libraryFolderId,
    relativePath,
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
          percent:
            totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0,
        });
      },
    });

    return await finalizeLibraryUpload({ assetId, filename: file.name });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Could not upload ${file.name}`;
    await fetch(`/api/attachment-library/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadFailed: true, error: message }),
    }).catch(() => undefined);
    throw error instanceof Error ? error : new Error(message);
  }
}
