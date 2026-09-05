"use client";

import { useEffect, useState } from "react";
import { Download, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfPagePreview } from "@/components/report/pdf-page-preview";
import type { AttachmentProcessingStatus } from "@/db/schema";
import { kindFromMime } from "@/lib/attachments/file-types";
import { formatIngestPageLabel } from "@/lib/attachments/ingest-continue-limits";

export type AttachmentPreviewModel = {
  id: string;
  filename: string;
  description?: string | null;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  processingStatus: AttachmentProcessingStatus;
  processingPage: number | null;
  processingError?: string | null;
};

export function AttachmentPreviewPanel({
  attachment,
  previewUrl,
  downloadUrl,
  page = 1,
  onClose,
  showClose = true,
  testId = "attachment-viewer",
}: {
  attachment: AttachmentPreviewModel;
  previewUrl: string;
  downloadUrl: string;
  page?: number;
  onClose?: () => void;
  showClose?: boolean;
  testId?: string;
}) {
  const [visiblePage, setVisiblePage] = useState(page);
  const pageSourceKey = `${attachment.id}:${page}`;
  const [seenPageSourceKey, setSeenPageSourceKey] = useState(pageSourceKey);
  if (seenPageSourceKey !== pageSourceKey) {
    setSeenPageSourceKey(pageSourceKey);
    setVisiblePage(page);
  }

  useEffect(() => {
    if (!onClose) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.target instanceof HTMLElement && event.target.closest('[role="dialog"]')) {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const isDocx = kindFromMime(attachment.mimeType) === "docx";
  const pageLabel = isDocx
    ? "Word document"
    : attachment.pageCount
      ? `Page ${visiblePage} of ${attachment.pageCount}`
      : `Page ${visiblePage}`;
  const canPreview = attachment.pageCount != null;
  const indexing = isIndexingStatus(attachment.processingStatus);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)]"
      data-testid={testId}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-base font-semibold">
            <FileText className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{attachment.filename}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {pageLabel}
            {indexing
              ? formatIngestPageLabel(attachment.processingPage)
                ? ` · Indexing page ${attachment.processingPage}…`
                : " · Indexing for search…"
              : null}
            {canPreview && attachment.processingStatus === "failed"
              ? " · Indexing failed (preview still available)"
              : null}
            {canPreview &&
            attachment.processingStatus === "ready" &&
            attachment.processingError
              ? " · Indexing incomplete (preview still available)"
              : null}
          </p>
          {attachment.description ? (
            <p className="mt-1 line-clamp-3 text-xs leading-snug text-[var(--muted-foreground)]">
              {attachment.description}
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
        {showClose && onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close document"
            data-testid="attachment-viewer-close"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden overscroll-contain">
        {canPreview ? (
          isDocx ? (
            <iframe
              key={previewUrl}
              src={previewUrl}
              title={attachment.filename}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="h-full w-full bg-white"
            />
          ) : (
            <PdfPagePreview
              key={attachment.id}
              src={previewUrl}
              page={page}
              title={attachment.filename}
              sizeBytes={attachment.sizeBytes}
              onVisiblePageChange={setVisiblePage}
            />
          )
        ) : (
          <div className="p-6 text-sm text-[var(--muted-foreground)]">
            {attachment.processingStatus === "failed"
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
