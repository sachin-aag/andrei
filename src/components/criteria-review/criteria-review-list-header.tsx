"use client";

import { ClipboardCheck } from "lucide-react";

export function CriteriaReviewListHeader({
  reportCount,
  reviewerName,
  reviewerEmail,
}: {
  reportCount: number;
  reviewerName: string;
  reviewerEmail: string;
}) {
  return (
    <header className="shrink-0 border-b border-[var(--border)] px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-[var(--brand-600)]" />
            <h1 className="text-lg font-semibold">Criteria review</h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Review AI traffic-light evaluations on sample deviation reports (one
            report per session).
          </p>
          {reportCount > 0 && (
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              {reportCount} report{reportCount === 1 ? "" : "s"} in Neon
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className="text-xs text-[var(--muted-foreground)]">Signed in as</p>
          <p className="font-medium">
            {reviewerName}{" "}
            <span className="font-normal text-[var(--muted-foreground)]">
              ({reviewerEmail})
            </span>
          </p>
        </div>
      </div>
    </header>
  );
}
