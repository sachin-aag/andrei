"use client";

import Link from "next/link";
import { History, LifeBuoy, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ReportActionsMenuProps = {
  /** Audit trail link, when the current surface exposes one. */
  auditHref?: string;
  showExpertReview?: boolean;
  onExpertReview?: () => void;
};

/**
 * Overflow for report actions that do not earn a slot on the header bar.
 * Export variants live on the export split button; track changes is an editing
 * mode and lives in the editor toolbar.
 */
export function ReportActionsMenu({
  auditHref,
  showExpertReview = false,
  onExpertReview,
}: ReportActionsMenuProps) {
  // An overflow affordance with nothing behind it is worse than no affordance.
  if (!((showExpertReview && onExpertReview) || auditHref)) return null;

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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
