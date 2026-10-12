"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  REVIEW_SEVERITY_LABEL,
  coerceReviewSeverity,
  type ReviewSeverity,
} from "@/lib/review/severity";
import type { ReviewFindingCardModel } from "@/lib/review/finding-card";

const SEVERITY_BADGE: Record<ReviewSeverity, string> = {
  critical: "bg-red-50 text-red-700",
  major: "bg-amber-50 text-amber-800",
  minor: "bg-sky-50 text-sky-800",
};

const SEVERITY_ACCENT: Record<ReviewSeverity, string> = {
  critical: "border-l-red-500",
  major: "border-l-amber-500",
  minor: "border-l-sky-500",
};

export function ReviewFindingCard({
  severity,
  card,
  located,
  onShowInDocument,
  onApplyTrackedChange,
  extra,
}: {
  severity: string;
  card: ReviewFindingCardModel;
  located?: boolean;
  onShowInDocument?: () => void;
  onApplyTrackedChange?: () => void;
  extra?: ReactNode;
}) {
  const level = coerceReviewSeverity(severity);
  return (
    <article
      className={cn(
        "rounded-lg border border-[var(--border)] border-l-4 bg-[var(--card)] px-3.5 py-3",
        SEVERITY_ACCENT[level],
        located && "ring-2 ring-yellow-300/80"
      )}
      data-testid="review-finding-card"
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            SEVERITY_BADGE[level]
          )}
        >
          {REVIEW_SEVERITY_LABEL[level]}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium leading-snug text-[var(--muted-foreground)]">
            {card.location}
          </p>
          {card.kicker ? (
            <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">
              {card.kicker}
            </p>
          ) : null}
        </div>
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug text-[var(--foreground)]">
        {card.title}
      </h3>
      {card.body ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
          {card.body}
        </p>
      ) : null}
      {card.replacement ? (
        <div className="mt-3 rounded-md border border-emerald-200/80 bg-emerald-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            Suggested replacement
          </p>
          <p className="mt-1 text-sm leading-snug text-[var(--foreground)]">
            {card.replacement}
          </p>
        </div>
      ) : null}
      {card.locate || card.applyCommentId ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {card.locate && onShowInDocument ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-[var(--card)]"
              onClick={onShowInDocument}
            >
              Show in document
            </Button>
          ) : null}
          {card.applyCommentId && onApplyTrackedChange ? (
            <Button
              type="button"
              size="sm"
              variant="success"
              onClick={onApplyTrackedChange}
            >
              Apply as tracked change
            </Button>
          ) : null}
        </div>
      ) : null}
      {extra}
    </article>
  );
}
