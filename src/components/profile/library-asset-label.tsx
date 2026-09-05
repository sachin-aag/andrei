import { formatLibraryUploadedAt } from "@/lib/attachments/library-display";
import type { AttachmentProcessingStatus } from "@/db/schema";

type Props = {
  filename: string;
  uploadedAt: string;
  processingStatus?: AttachmentProcessingStatus;
};

export function LibraryAssetLabel({
  filename,
  uploadedAt,
  processingStatus = "ready",
}: Props) {
  return (
    <div className="min-w-0 flex-1 text-left">
      <div className="truncate text-sm">{filename}</div>
      <div className="truncate text-xs text-[var(--muted-foreground)]">
        Uploaded {formatLibraryUploadedAt(uploadedAt)}
        {processingStatus !== "ready" ? ` · ${processingStatus}` : ""}
      </div>
    </div>
  );
}
