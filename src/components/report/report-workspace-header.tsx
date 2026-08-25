"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { WorkspaceMode } from "@/providers/report-provider";
import type { ReportRecord } from "@/types/report";
import { ReportActionsMenu } from "./report-actions-menu";
import { RunAllEvaluationButton } from "./section-status-pill";
import { StatusBadge } from "./status-badge";

type ReportWorkspaceHeaderProps = {
  report: ReportRecord;
  mode: WorkspaceMode;
  authorName?: string;
  managerNames?: string[];
  trackChangesMode: boolean;
  onTrackChangesModeChange: (next: boolean) => void;
  canSubmit: boolean;
  canReview: boolean;
  submitting: boolean;
  approving: boolean;
  sendingFeedback: boolean;
  onSubmit: () => void;
  onApprove: () => void;
  onFeedback: () => void;
  auditHref?: string;
  backHref?: string;
  backLabel?: string;
  canEditDetails?: boolean;
  onEditDetails?: () => void;
  showExpertReview?: boolean;
  onExpertReview?: () => void;
};

export function ReportWorkspaceHeader({
  report,
  mode,
  authorName,
  managerNames = [],
  trackChangesMode,
  onTrackChangesModeChange,
  canSubmit,
  canReview,
  submitting,
  approving,
  sendingFeedback,
  onSubmit,
  onApprove,
  onFeedback,
  auditHref,
  backHref = "/",
  backLabel = "Reports",
  canEditDetails = false,
  onEditDetails,
  showExpertReview = false,
  onExpertReview,
}: ReportWorkspaceHeaderProps) {
  const title = report.documentNo || "Untitled";
  const [navigatingBack, setNavigatingBack] = useState(false);
  const isViewMode = mode === "view";

  return (
    <header className="h-16 border-b border-[var(--border)] bg-[var(--card)] px-6 flex items-center gap-4 shrink-0">
      <Button asChild variant="ghost" size="sm" disabled={navigatingBack}>
        <Link
          href={backHref}
          transitionTypes={["nav-back"]}
          onClick={() => setNavigatingBack(true)}
          aria-busy={navigatingBack}
        >
          {navigatingBack ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ChevronLeft className="size-4" aria-hidden="true" />
          )}
          {backLabel}
        </Link>
      </Button>
      <Separator orientation="vertical" className="h-6" />
      <div className="flex flex-col leading-tight min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{title}</span>
          <StatusBadge status={report.status} />
          {canEditDetails && onEditDetails ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-[var(--muted-foreground)]"
              aria-label="Edit deviation number and reviewer managers"
              onClick={onEditDetails}
            >
              <Pencil className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <span className="text-xs text-[var(--muted-foreground)] truncate">
          {authorName ?? "Unknown author"}
          {managerNames.length > 0 ? ` → ${managerNames.join(", ")}` : ""}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
        {!isViewMode && trackChangesMode ? (
          <TrackChangesPill onTurnOff={() => onTrackChangesModeChange(false)} />
        ) : null}

        {!isViewMode && <RunAllEvaluationButton />}

        {canSubmit && (
          <Button size="sm" onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
            Submit for review
          </Button>
        )}

        {canReview && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onFeedback}
              disabled={sendingFeedback}
            >
              {sendingFeedback ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <MessageSquare className="size-4" aria-hidden="true" />
              )}
              Return with feedback
            </Button>
            <Button
              variant="success"
              size="sm"
              onClick={onApprove}
              disabled={approving}
            >
              {approving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              )}
              Approve
            </Button>
          </>
        )}

        <ReportActionsMenu
          reportId={report.id}
          auditHref={auditHref}
          showTrackChanges={!isViewMode}
          trackChangesMode={trackChangesMode}
          onTrackChangesModeChange={onTrackChangesModeChange}
          showExpertReview={showExpertReview}
          onExpertReview={onExpertReview}
        />
      </div>
    </header>
  );
}

/** Only rendered while track changes is on, so the mode is never silently active. */
function TrackChangesPill({ onTurnOff }: { onTurnOff: () => void }) {
  return (
    <button
      type="button"
      onClick={onTurnOff}
      aria-label="Turn off track changes"
      title="Track changes is on — click to turn it off"
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] cursor-pointer"
    >
      <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      Track changes
      <X className="size-3" aria-hidden="true" />
    </button>
  );
}
