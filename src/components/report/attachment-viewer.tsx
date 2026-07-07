"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportAttachments } from "@/providers/report-provider";

export function AttachmentViewer() {
  const { attachments, activeAttachmentId, closeAttachment, reportId } =
    useReportAttachments();

  const attachment = attachments.find((a) => a.id === activeAttachmentId);
  if (!attachment) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--muted-foreground)]">
        Attachment not found
      </div>
    );
  }

  const src = `/api/reports/${reportId}/attachments/${attachment.id}/content`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-3 bg-[var(--card)]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={closeAttachment}
        >
          <ArrowLeft className="size-4" />
          Back to report
        </Button>
        <span className="text-sm font-medium truncate">{attachment.filename}</span>
      </div>
      <iframe
        title={attachment.filename}
        src={src}
        className="flex-1 min-h-0 w-full border-0 bg-[var(--secondary)]/30"
      />
    </div>
  );
}
