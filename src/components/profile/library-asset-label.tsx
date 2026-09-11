import { formatLibraryUploadedAt } from "@/lib/attachments/library-display";
import type { AttachmentProcessingStatus } from "@/db/schema";

type Props = {
  filename: string;
  uploadedAt: string;
  processingStatus?: AttachmentProcessingStatus;
  processingProgress?: number;
};

function statusSuffix(
  status: AttachmentProcessingStatus,
  processingProgress?: number
): string {
  switch (status) {
    case "validating":
      return " · Validating…";
    case "queued":
      return " · Indexing…";
    case "processing":
      return processingProgress != null && processingProgress > 0
        ? ` · Indexing… ${processingProgress}%`
        : " · Indexing…";
    case "failed":
      return " · Indexing failed";
    case "uploading":
      return " · Uploading…";
    case "ready":
      return "";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function LibraryAssetLabel({
  filename,
  uploadedAt,
  processingStatus = "ready",
  processingProgress,
}: Props) {
  return (
    <div className="min-w-0 flex-1 text-left">
      <div className="truncate text-sm">{filename}</div>
      <div className="truncate text-xs text-[var(--muted-foreground)]">
        Uploaded {formatLibraryUploadedAt(uploadedAt)}
        {statusSuffix(processingStatus, processingProgress)}
      </div>
    </div>
  );
}
