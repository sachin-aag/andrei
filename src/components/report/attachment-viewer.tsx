"use client";

import { ChevronLeft, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PdfPagePreview } from "@/components/report/pdf-page-preview";
import type { AttachmentProcessingStatus } from "@/db/schema";
import { kindFromMime } from "@/lib/attachments/file-types";
import { formatIngestPageLabel } from "@/lib/attachments/ingest-continue";
import {
  attachmentDownloadHref,
  attachmentPreviewSrc,
} from "@/lib/attachments/preview-urls";
import { useReportAttachments } from "@/providers/report-attachments-provider";

export function AttachmentViewer() {
  const { activeAttachment, activePage, closeDocument, reportId } =
    useReportAttachments();

  if (!activeAttachment) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-[var(--muted-foreground)]">
          Select a document from the Documents tab to preview it.
        </CardContent>
      </Card>
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
      ? `Page ${activePage} of ${activeAttachment.pageCount}`
      : `Page ${activePage}`;
  // File is on permanent storage once pageCount is set (finalize); indexing can still be running.
  const canPreview = activeAttachment.pageCount != null;
  const indexing = isIndexingStatus(activeAttachment.processingStatus);

  return (
    <Card className="min-h-[calc(100vh-12rem)] overflow-hidden">
      <CardHeader className="border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={closeDocument}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{activeAttachment.filename}</span>
            </CardTitle>
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
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {canPreview ? (
          isDocx ? (
            <iframe
              key={previewUrl}
              src={previewUrl}
              title={activeAttachment.filename}
              // Untrusted HTML — no scripts. allow-popups* so target=_blank
              // links open a real new tab instead of replacing the preview.
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="h-[calc(100vh-16rem)] min-h-[720px] w-full bg-white"
            />
          ) : (
            <PdfPagePreview
              src={previewUrl}
              page={activePage}
              title={activeAttachment.filename}
            />
          )
        ) : (
          <div className="p-6 text-sm text-[var(--muted-foreground)]">
            {activeAttachment.processingStatus === "failed"
              ? "This document could not be stored, so it cannot be previewed."
              : "Upload is still finishing. Preview will be available once the file is stored."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function isIndexingStatus(status: AttachmentProcessingStatus): boolean {
  return status === "queued" || status === "processing" || status === "validating";
}
