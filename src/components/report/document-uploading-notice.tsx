"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  hasPendingAttachments,
  shouldShowDocumentUploadingNotice,
} from "@/lib/attachments/processing-status";
import { useReportAttachments } from "@/providers/report-attachments-provider";

export const DOCUMENT_UPLOADING_NOTICE =
  "A document is still uploading.";

export function DocumentUploadingNotice() {
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="document-uploading-notice"
      className="mb-2 flex items-center gap-1.5 text-[11px] text-amber-800"
    >
      <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
      <span>{DOCUMENT_UPLOADING_NOTICE}</span>
    </p>
  );
}

/**
 * Show the notice after the first keystroke while an attachment is still
 * uploading or processing. Typing and send stay enabled; the latch clears
 * when every attachment reaches ready or failed.
 */
export function useDocumentUploadingNotice(input: string): boolean {
  const { attachments } = useReportAttachments();
  const pending = hasPendingAttachments(attachments);
  const [typedDuringPending, setTypedDuringPending] = useState(false);

  useEffect(() => {
    if (!pending) {
      setTypedDuringPending(false);
      return;
    }
    if (input.length > 0) {
      setTypedDuringPending(true);
    }
  }, [input, pending]);

  return shouldShowDocumentUploadingNotice(pending, typedDuringPending);
}
