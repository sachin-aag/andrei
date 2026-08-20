"use client";

import { useEffect, useState } from "react";
import {
  describeUploadTape,
  type UploadTransferState,
} from "@/lib/attachments/large-upload";
import type { AttachmentProcessingStatus } from "@/db/schema";

/**
 * Progress for one large attachment, shown in place of the thin row bar.
 *
 * The band is a single object whose unit changes with the phase: while sending,
 * one cell is 8 MB of acknowledged bytes; while reading, one cell is one page. The
 * wipe and re-flow between the two is the moment that tells the user the file
 * arrived and the document is now being read.
 */
export function LargeUploadTape({
  status,
  sizeBytes,
  transfer,
  processingProgress,
  processingPage,
  pageCount,
}: {
  status: AttachmentProcessingStatus;
  sizeBytes: number;
  transfer: UploadTransferState | null;
  processingProgress: number;
  processingPage: number | null;
  pageCount: number | null;
}) {
  // Only the transfer phase needs a clock — it decays the estimate between
  // chunk arrivals and notices a stall. The tick only ever fires from the timer
  // callback, and zero means "clock not started", which keeps SSR deterministic
  // and makes a stale reading from a previous transfer harmless.
  const isTransferring = status === "uploading";
  const [tickMs, setTickMs] = useState(0);

  useEffect(() => {
    if (!isTransferring) return;
    const timer = window.setInterval(() => setTickMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isTransferring]);

  const view = describeUploadTape({
    status,
    sizeBytes,
    transfer,
    processingProgress,
    processingPage,
    pageCount,
    nowMs: isTransferring ? tickMs : 0,
  });
  if (!view) return null;

  return (
    <div className="mt-1.5 pl-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="min-w-0 truncate text-[11px] leading-tight text-[var(--muted-foreground)]"
          aria-live="polite"
        >
          {view.line}
        </span>
        {view.figure ? (
          <span className="shrink-0 font-mono text-[10px] tabular-nums tracking-tight text-[var(--muted-foreground)]">
            {view.figure}
          </span>
        ) : null}
      </div>

      <div
        className="upload-tape mt-1 flex h-1.5 items-stretch gap-[2px]"
        data-phase={view.phase}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(view.percent)}
        aria-label={view.ariaLabel}
        title={view.ariaLabel}
      >
        {Array.from({ length: view.cellCount }, (_, index) => (
          <span
            key={index}
            className="upload-tape__cell"
            data-state={
              index < view.filledCells
                ? "inked"
                : index === view.headCell
                  ? "head"
                  : "blank"
            }
          />
        ))}
      </div>
    </div>
  );
}
