"use client";

import Link from "next/link";
import { Download, History, LifeBuoy, MoreHorizontal, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { captureEvent } from "@/lib/analytics/events";
import { getCustomerPack } from "@/lib/customers/packs";
import { exportHref } from "./report-export-button";

type ReportActionsMenuProps = {
  reportId: string;
  /** Audit trail link, when the current surface exposes one. */
  auditHref?: string;
  /** Track changes is an editing control — hidden on read-only surfaces. */
  showTrackChanges?: boolean;
  trackChangesMode?: boolean;
  onTrackChangesModeChange?: (next: boolean) => void;
  showExpertReview?: boolean;
  onExpertReview?: () => void;
};

/**
 * Overflow for report actions that do not earn a slot on the header bar —
 * export variants, expert review, the audit trail, and the track-changes mode.
 */
export function ReportActionsMenu({
  reportId,
  auditHref,
  showTrackChanges = false,
  trackChangesMode = false,
  onTrackChangesModeChange,
  showExpertReview = false,
  onExpertReview,
}: ReportActionsMenuProps) {
  const omitCitationsEnabled = getCustomerPack().citationsAtEndOfSection;

  const canToggleTrackChanges = showTrackChanges && onTrackChangesModeChange;
  const hasReviewGroup = Boolean((showExpertReview && onExpertReview) || auditHref);
  // Separators only earn their place between two populated groups.
  const showTrackChangesDivider = omitCitationsEnabled || hasReviewGroup;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="px-2"
          aria-label="More report actions"
          title="More report actions"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[15rem]">
        {omitCitationsEnabled ? (
          <DropdownMenuItem asChild>
            <a
              href={exportHref(reportId, true)}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                captureEvent("report_exported", { reportId, omitCitations: true })
              }
            >
              <Download aria-hidden="true" />
              Export without citations
            </a>
          </DropdownMenuItem>
        ) : null}

        {omitCitationsEnabled && hasReviewGroup ? <DropdownMenuSeparator /> : null}
        {showExpertReview && onExpertReview ? (
          <DropdownMenuItem onSelect={onExpertReview}>
            <LifeBuoy aria-hidden="true" />
            Ask an Andrei expert
          </DropdownMenuItem>
        ) : null}
        {auditHref ? (
          <DropdownMenuItem asChild>
            <Link href={auditHref}>
              <History aria-hidden="true" />
              Audit trail
            </Link>
          </DropdownMenuItem>
        ) : null}

        {canToggleTrackChanges ? (
          <>
            {showTrackChangesDivider ? <DropdownMenuSeparator /> : null}
            <DropdownMenuCheckboxItem
              checked={trackChangesMode}
              onCheckedChange={(next) => onTrackChangesModeChange(next === true)}
            >
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <PenLine className="size-3.5" aria-hidden="true" />
                  Track changes
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  Mark edits instead of applying them straight away.
                </span>
              </span>
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
