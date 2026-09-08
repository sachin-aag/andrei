"use client";

import { AttachmentPreviewPanel } from "@/components/report/attachment-preview-panel";
import {
  attachmentDownloadHref,
  attachmentPreviewSrc,
} from "@/lib/attachments/preview-urls";
import { useReportAttachments } from "@/providers/report-attachments-provider";

export function AttachmentViewer({
  attachmentId,
  active = true,
  onClose,
}: {
  attachmentId: string;
  active?: boolean;
  onClose?: () => void;
}) {
  const {
    attachments,
    closeDocument,
    previewPageFor,
    rememberDocumentPage,
    reportId,
  } = useReportAttachments();
  const attachment =
    attachments.find((item) => item.id === attachmentId) ?? null;
  const page = previewPageFor(attachmentId);
  const dismiss = onClose ?? closeDocument;

  if (!attachment) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Select a document from the Documents tab to preview it.
      </div>
    );
  }

  return (
    <AttachmentPreviewPanel
      attachment={{
        id: attachment.id,
        filename: attachment.filename,
        description: attachment.description,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        pageCount: attachment.pageCount,
        processingStatus: attachment.processingStatus,
        processingPage: attachment.processingPage,
        processingError: attachment.processingError,
      }}
      previewUrl={attachmentPreviewSrc({
        reportId,
        attachmentId: attachment.id,
        mimeType: attachment.mimeType,
        page,
      })}
      downloadUrl={attachmentDownloadHref(reportId, attachment.id)}
      page={page}
      active={active}
      onVisiblePageChange={(nextPage) =>
        rememberDocumentPage(attachment.id, nextPage)
      }
      onClose={dismiss}
    />
  );
}
