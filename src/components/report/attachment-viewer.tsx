"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Download, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfPagePreview } from "@/components/report/pdf-page-preview";
import type { AttachmentProcessingStatus } from "@/db/schema";
import { kindFromMime } from "@/lib/attachments/file-types";
import { formatIngestPageLabel } from "@/lib/attachments/ingest-continue-limits";
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
  const [visiblePage, setVisiblePage] = useState(activePage);
  const pageSourceKey = `${activeAttachment?.id ?? ""}:${activePage}`;
  const [seenPageSourceKey, setSeenPageSourceKey] = useState(pageSourceKey);
  if (seenPageSourceKey !== pageSourceKey) {
    setSeenPageSourceKey(pageSourceKey);
    setVisiblePage(activePage);
  }

  useEffect(() => {
    if (!activeAttachment) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.target instanceof HTMLElement && event.target.closest('[role="dialog"]')) {
        return;
      }
      event.preventDefault();
      dismiss();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeAttachment, dismiss]);

  if (!activeAttachment) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Select a document from the Documents tab to preview it.
      </div>
    );
  }

  const isDocx = kindFromMime(activeAttachment.mimeType) === "docx";
  const previewUrl = attachmentPreviewSrc({
    reportId,
    attachmentId: activeAttachment.id,
    mimeType: activeAttachment.mimeType,
    page: activePage,
  });
  const downloadUrl = attachmentDownloadHref(reportId, activeAttachment.id);
  const pageLabel = isDocx
    ? "Word document"
    : activeAttachment.pageCount
      ? `Page ${visiblePage} of ${activeAttachment.pageCount}`
      : `Page ${visiblePage}`;
  // File is on permanent storage once pageCount is set (finalize); indexing can still be running.
  const canPreview = activeAttachment.pageCount != null;
  const indexing = isIndexingStatus(activeAttachment.processingStatus);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)]"
      data-testid="attachment-viewer"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <Button
          type="button"
          variant="outline"
          onClick={dismiss}
          aria-label="Back to report"
          data-testid="attachment-viewer-back"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Back to report
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-base font-semibold">
            <FileText className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{activeAttachment.filename}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {pageLabel}
            {indexing
              ? formatIngestPageLabel(activeAttachment.processingPage)
                ? ` · Indexing page ${activeAttachment.processingPage}…`
                : " · Indexing for search…"
              : null}
            {canPreview && activeAttachment.processingStatus === "failed"
              ? " · Indexing failed (preview still available)"
              : null}
            {canPreview &&
            activeAttachment.processingStatus === "ready" &&
            activeAttachment.processingError
              ? " · Indexing incomplete (preview still available)"
              : null}
          </p>
          {activeAttachment.description ? (
            <p className="mt-1 line-clamp-3 text-xs leading-snug text-[var(--muted-foreground)]">
              {activeAttachment.description}
            </p>
          ) : null}
        </div>
        {canPreview ? (
          <Button asChild variant="outline" size="sm">
            <a href={downloadUrl}>
              <Download className="size-4" aria-hidden="true" />
              Download
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={dismiss}
          aria-label="Close document"
          data-testid="attachment-viewer-close"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {canPreview ? (
          isDocx ? (
            <iframe
              key={previewUrl}
              src={previewUrl}
              title={activeAttachment.filename}
              // Untrusted HTML — no scripts. allow-popups* so target=_blank
              // links open a real new tab instead of replacing the preview.
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="h-full w-full bg-white"
            />
          ) : (
            <PdfPagePreview
              key={activeAttachment.id}
              src={previewUrl}
              page={activePage}
              title={activeAttachment.filename}
              sizeBytes={activeAttachment.sizeBytes}
              onVisiblePageChange={setVisiblePage}
            />
          )
        ) : (
          <div className="p-6 text-sm text-[var(--muted-foreground)]">
            {activeAttachment.processingStatus === "failed"
              ? "This document could not be stored, so it cannot be previewed."
              : "Upload is still finishing. Preview will be available once the file is stored."}
          </div>
        )}
      </div>
    </div>
  );
}

function isIndexingStatus(status: AttachmentProcessingStatus): boolean {
  return status === "queued" || status === "processing" || status === "validating";
}
