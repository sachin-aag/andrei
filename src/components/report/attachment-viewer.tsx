"use client";

import { AttachmentPreviewPanel } from "@/components/report/attachment-preview-panel";
import {
  attachmentDownloadHref,
  attachmentPreviewSrc,
} from "@/lib/attachments/preview-urls";
import { useReportAttachments } from "@/providers/report-attachments-provider";

export function AttachmentViewer({
  onClose,
}: {
  onClose?: () => void;
} = {}) {
  const { activeAttachment, activePage, closeDocument, reportId } =
    useReportAttachments();
  const dismiss = onClose ?? closeDocument;

  if (!activeAttachment) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Select a document from the Documents tab to preview it.
      </div>
    );
  }

  return (
    <AttachmentPreviewPanel
      attachment={{
        id: activeAttachment.id,
        filename: activeAttachment.filename,
        description: activeAttachment.description,
        mimeType: activeAttachment.mimeType,
        sizeBytes: activeAttachment.sizeBytes,
        pageCount: activeAttachment.pageCount,
        processingStatus: activeAttachment.processingStatus,
        processingPage: activeAttachment.processingPage,
        processingError: activeAttachment.processingError,
      }}
      previewUrl={attachmentPreviewSrc({
        reportId,
        attachmentId: activeAttachment.id,
        mimeType: activeAttachment.mimeType,
        page: activePage,
      })}
      downloadUrl={attachmentDownloadHref(reportId, activeAttachment.id)}
      page={activePage}
      onClose={dismiss}
    />
  );
}
