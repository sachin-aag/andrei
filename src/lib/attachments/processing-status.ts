import type { AttachmentProcessingStatus } from "@/db/schema";

const PENDING_ATTACHMENT_STATUSES = new Set<AttachmentProcessingStatus>([
  "uploading",
  "validating",
  "queued",
  "processing",
]);

export function isPendingAttachmentStatus(
  status: AttachmentProcessingStatus
): boolean {
  return PENDING_ATTACHMENT_STATUSES.has(status);
}

export function hasPendingAttachments(
  attachments: readonly { processingStatus: AttachmentProcessingStatus }[]
): boolean {
  return attachments.some((item) =>
    isPendingAttachmentStatus(item.processingStatus)
  );
}

/** Latch: first keystroke during an in-flight ingest keeps the notice up. */
export function shouldShowDocumentUploadingNotice(
  pending: boolean,
  typedDuringPending: boolean
): boolean {
  return pending && typedDuringPending;
}
