"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  MessageSquare,
  Pencil,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { WorkspaceMode } from "@/providers/report-provider";
import type { ReportRecord } from "@/types/report";
import { ReportActionsMenu } from "./report-actions-menu";
import { ReportBulkSuggestionActions } from "./report-bulk-suggestion-actions";
import { ReportExportButton } from "./report-export-button";
import { RunAllEvaluationButton } from "./section-status-pill";
import { StatusBadge } from "./status-badge";
import type { WorkspaceChrome, WorkProductView } from "./workspace-chrome";

function oppositeWorkspaceChrome(chrome: WorkspaceChrome): WorkspaceChrome {
  switch (chrome) {
    case "document":
      return "agent";
    case "agent":
      return "document";
    default: {
      const _exhaustive: never = chrome;
      return _exhaustive;
    }
  }
}

const CHROME_SWITCH_NOUN: Record<WorkspaceChrome, string> = {
  document: "Document",
  agent: "Agent",
};

type ReportWorkspaceHeaderProps = {
  report: ReportRecord;
  mode: WorkspaceMode;
  chrome: WorkspaceChrome;
  onChromeChange: (chrome: WorkspaceChrome) => void;
  workProductView: WorkProductView;
  authorName?: string;
  managerNames?: string[];
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
  chrome,
  onChromeChange,
  workProductView,
  authorName,
  managerNames = [],
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
  const showRunCriteria = !isViewMode && workProductView === "report";
  const showBulkSuggestions = showRunCriteria && chrome === "document";
  const nextChrome = oppositeWorkspaceChrome(chrome);
  const switchLabel = `Switch to ${CHROME_SWITCH_NOUN[nextChrome]}`;

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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        data-testid="report-chrome-switch"
        data-current-chrome={chrome}
        onClick={() => onChromeChange(nextChrome)}
      >
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        {switchLabel}
      </Button>

      <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
        <ReportExportButton
          reportId={report.id}
          sourceDocxFilename={report.sourceDocxFilename}
          documentType={report.documentType}
        />

        {showRunCriteria ? <RunAllEvaluationButton /> : null}
        {showBulkSuggestions ? <ReportBulkSuggestionActions /> : null}

        {canSubmit && (
          <Button size="sm" onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" />
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
                <MessageSquare className="size-4" />
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
                <CheckCircle2 className="size-4" />
              )}
              Approve
            </Button>
          </>
        )}

        <ReportActionsMenu
          auditHref={auditHref}
          showExpertReview={showExpertReview}
          onExpertReview={onExpertReview}
        />
      </div>
    </header>
  );
}
