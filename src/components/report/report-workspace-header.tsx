"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  Download,
  History,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { WorkspaceMode } from "@/providers/report-provider";
import type { ReportRecord } from "@/types/report";
import { RunAllEvaluationButton } from "./section-status-pill";
import { StatusBadge } from "./status-badge";
import { captureEvent } from "@/lib/analytics/events";

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
}: ReportWorkspaceHeaderProps) {
  const title = report.deviationNo || "Untitled";
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
        <div className="flex items-center gap-2">
          <span className="font-semibold truncate">{title}</span>
          <StatusBadge status={report.status} />
        </div>
        <span className="text-xs text-[var(--muted-foreground)] truncate">
          {authorName ?? "Unknown author"}
          {managerNames.length > 0 ? ` \u2192 ${managerNames.join(", ")}` : ""}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
        {!isViewMode && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <Checkbox
                id={`track-changes-toggle-${mode}`}
                checked={trackChangesMode}
                onCheckedChange={(v) => onTrackChangesModeChange(v === true)}
              />
              <Label
                htmlFor={`track-changes-toggle-${mode}`}
                className="text-sm font-normal cursor-pointer whitespace-nowrap"
              >
                Track changes
              </Label>
              {trackChangesMode && (
                <span className="text-[10px] uppercase tracking-wide text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200/80">
                  On
                </span>
              )}
            </div>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />

            <RunAllEvaluationButton />
          </>
        )}
        {mode === "edit" &&
          (report.status === "draft" || report.status === "feedback") && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/reports/${report.id}/guided`}>
                <Sparkles className="size-4" aria-hidden="true" />
                Refine with Andrei
              </Link>
            </Button>
          )}
        {auditHref ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={auditHref}>
              <History className="size-4" aria-hidden="true" />
              Audit Trail
            </Link>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" asChild>
          <a
            href={`/api/reports/${report.id}/export`}
            target="_blank"
            rel="noreferrer"
            onClick={() => captureEvent("report_exported", { reportId: report.id })}
          >
            <Download className="size-4" aria-hidden="true" />
            Export DOCX
          </a>
        </Button>

        {canSubmit && (
          <Button size="sm" onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
            Submit for Review
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
              Return with Feedback
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
      </div>
    </header>
  );
}
