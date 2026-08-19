"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  summarizeDocumentReviewProgress,
  type DocumentReviewToolPart,
  type DocumentReviewUiPhase,
} from "@/lib/ai/chat/document-review-ui";

export function DocumentReviewProgress({
  parts,
}: {
  parts: readonly DocumentReviewToolPart[];
}) {
  const snapshot = summarizeDocumentReviewProgress(parts);
  if (!snapshot) return null;

  const Icon =
    snapshot.phase === "complete"
      ? Check
      : snapshot.phase === "error"
        ? Loader2
        : Loader2;
  const spinning = snapshot.pending && snapshot.phase !== "complete";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
        toneClass(snapshot.phase)
      )}
      aria-live="polite"
      aria-label={snapshot.label}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          spinning && snapshot.phase !== "complete" && snapshot.phase !== "error"
            ? "animate-spin motion-reduce:animate-none"
            : null,
          snapshot.phase === "complete" && "text-emerald-600 dark:text-emerald-300"
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 break-words">{snapshot.label}</span>
    </div>
  );
}

function toneClass(phase: DocumentReviewUiPhase): string {
  switch (phase) {
    case "complete":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "error":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "planning":
    case "reviewing":
    case "finalizing":
      return "border-[var(--border)] bg-[var(--secondary)]/40 text-[var(--muted-foreground)]";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
