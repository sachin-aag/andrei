/** Server reserve-upload error when the per-report count quota is hit. */
export function isAttachmentCountLimitError(message: string): boolean {
  return /already has \d+ attachments/i.test(message);
}

/** Count or total-bytes per-report quota errors from reserve/finalize. */
export function isAttachmentQuotaError(message: string): boolean {
  return (
    isAttachmentCountLimitError(message) ||
    /attachment storage limit exceeded/i.test(message)
  );
}

export function formatAttachmentCountLimitMessage(max: number): string {
  return `This report already has the maximum of ${max} attachments. Remove an existing document before uploading more.`;
}

export function formatAttachmentWouldExceedMessage({
  max,
  remaining,
  attempted,
}: {
  max: number;
  remaining: number;
  attempted: number;
}): string {
  if (remaining <= 0) {
    return formatAttachmentCountLimitMessage(max);
  }
  return `You selected ${attempted} PDF${attempted === 1 ? "" : "s"}, but this report can only accept ${remaining} more (limit is ${max} per report). Remove some files or delete existing documents, then try again.`;
}
