"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  Download,
  ListChecks,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { SectionType } from "@/db/schema";
import type { WorkspaceMode } from "@/providers/report-provider";
import type { ReportRecord } from "@/types/report";
import { PlaceholdersPanel } from "./placeholders-panel";
import { StatusBadge } from "./status-badge";

type ReportWorkspaceHeaderProps = {
  report: ReportRecord;
  mode: WorkspaceMode;
  authorName?: string;
  managerName?: string;
  trackChangesMode: boolean;
  onTrackChangesModeChange: (next: boolean) => void;
  onJumpToSection: (section: SectionType) => void;
  onOpenCriteria: () => void;
  canSubmit: boolean;
  canReview: boolean;
  submitting: boolean;
  approving: boolean;
  sendingFeedback: boolean;
  onSubmit: () => void;
  onApprove: () => void;
  onFeedback: () => void;
};

export function ReportWorkspaceHeader({
  report,
  mode,
  authorName,
  managerName,
  trackChangesMode,
  onTrackChangesModeChange,
  onJumpToSection,
  onOpenCriteria,
  canSubmit,
  canReview,
  submitting,
  approving,
  sendingFeedback,
  onSubmit,
  onApprove,
  onFeedback,
}: ReportWorkspaceHeaderProps) {
  const title = report.deviationNo || "Untitled";

  return (
    <header className="h-16 border-b border-[var(--border)] bg-[var(--card)] px-6 flex items-center gap-4 shrink-0">
      <Button asChild variant="ghost" size="sm">
        <Link href="/" transitionTypes={["nav-back"]}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Dashboard
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
          {managerName ? ` \u2192 ${managerName}` : ""}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
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
        <PlaceholdersPanel onJumpToSection={onJumpToSection} />
        <Button variant="outline" size="sm" onClick={onOpenCriteria}>
          <ListChecks className="size-4" aria-hidden="true" />
          Criteria
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a
            href={`/api/reports/${report.id}/export`}
            target="_blank"
            rel="noreferrer"
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
