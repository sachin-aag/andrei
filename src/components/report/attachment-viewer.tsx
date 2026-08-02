"use client";

import { ChevronLeft, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AttachmentProcessingStatus } from "@/db/schema";
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

  const contentUrl = `/api/reports/${reportId}/attachments/${activeAttachment.id}/content?page=${activePage}`;
  const pageLabel = activeAttachment.pageCount
    ? `Page ${activePage} of ${activeAttachment.pageCount}`
    : `Page ${activePage}`;
  // PDF is on permanent storage once pageCount is set (finalize); indexing can still be running.
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
              {indexing ? " · Indexing for search…" : null}
              {canPreview && activeAttachment.processingStatus === "failed"
                ? " · Indexing failed (preview still available)"
                : null}
            </p>
          </div>
          {canPreview ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={contentUrl}
                target="_blank"
                rel="noreferrer"
                download={activeAttachment.filename}
              >
                <Download className="size-4" aria-hidden="true" />
                Download
              </a>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {canPreview ? (
          <iframe
            key={contentUrl}
            src={contentUrl}
            title={activeAttachment.filename}
            className="h-[calc(100vh-16rem)] min-h-[720px] w-full bg-white"
          />
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
