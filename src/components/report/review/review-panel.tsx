"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  REVIEW_CATEGORIES,
  categoryLabel,
  type ReviewCategory,
  type ReviewCheckDto,
  type ReviewCheckId,
  type ReviewFindingDto,
} from "@/lib/review/ui";
import { PlaceholdersPanelContent } from "@/components/report/placeholders-panel";
import { useReportEvaluations } from "@/providers/report-provider";
import type { Placeholder } from "@/lib/placeholders/find";
import type { SectionType } from "@/db/schema";
import {
  ReviewContext,
  useReview,
  type ReviewCategoryFilter,
} from "./review-context";
import { useReviewChecks } from "./use-review-checks";

type ProviderProps = {
  children: ReactNode;
};

function ReviewProvider({ children }: ProviderProps) {
  const review = useReviewChecks();
  const [category, setCategory] = useState<ReviewCategoryFilter>("all");
  const [openCheckId, setOpenCheckId] = useState<ReviewCheckId | null>(null);

  const value = useMemo(
    () => ({
      state: {
        checks: review.checks,
        findings: review.findings,
        placeholderCount: review.placeholderCount,
        category,
        openCheckId,
        runningCheckIds: review.runningCheckIds,
        loading: review.loading,
        canRun: review.canRun,
      },
      actions: {
        setCategory,
        toggleCheck: (checkId: ReviewCheckId) => {
          setOpenCheckId((current) => (current === checkId ? null : checkId));
        },
        runChecks: review.runChecks,
        patchFinding: review.patchFinding,
        refresh: review.refresh,
      },
    }),
    [category, openCheckId, review]
  );

  return <ReviewContext value={value}>{children}</ReviewContext>;
}

function statusLabel(check: ReviewCheckDto, running: boolean): string {
  if (running) return "Running";
  switch (check.status) {
    case "never_run":
      return "Never run";
    case "running":
      return "Running";
    case "clean":
      return "Clean";
    case "issues":
      return `${check.issueCount} ${check.issueCount === 1 ? "issue" : "issues"}`;
    case "out_of_date":
      return "Out of date";
    case "failed":
      return check.error ? `Failed: ${check.error}` : "Failed";
    default: {
      const _exhaustive: never = check.status;
      return _exhaustive;
    }
  }
}

function ReviewCategoryTabs() {
  const {
    state: { category, checks },
    actions: { setCategory },
  } = useReview();
  const counts = useMemo(() => {
    const byCategory = new Map<ReviewCategory, number>();
    for (const check of checks) {
      byCategory.set(
        check.category,
        (byCategory.get(check.category) ?? 0) + check.issueCount
      );
    }
    return byCategory;
  }, [checks]);

  const tabs: Array<{ id: ReviewCategoryFilter; label: string }> = [
    { id: "all", label: "All checks" },
    ...REVIEW_CATEGORIES.filter((id) =>
      checks.some((check) => check.category === id)
    ).map((id) => ({ id, label: categoryLabel(id) })),
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="tablist"
      aria-label="Review categories"
    >
      {tabs.map((tab) => {
        const selected = category === tab.id;
        const count =
          tab.id === "all"
            ? checks.reduce((sum, check) => sum + check.issueCount, 0)
            : (counts.get(tab.id) ?? 0);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setCategory(tab.id)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              selected
                ? "border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/50 hover:text-[var(--foreground)]"
            )}
          >
            {tab.label}
            {count > 0 ? (
              <span className="ml-1 rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function ReviewRunAll({
  layout = "panel",
  onRun,
}: {
  layout?: "panel" | "header";
  onRun?: () => void;
}) {
  const {
    state: { category, canRun, runningCheckIds, checks },
    actions: { runChecks },
  } = useReview();
  const running = runningCheckIds.length > 0;
  if (!canRun) return null;
  const categoryToRun =
    category === "all" ? undefined : (category as ReviewCategory);
  const runnable = checks.filter(
    (check) =>
      check.kind === "run" &&
      (category === "all" || check.category === category)
  );
  if (runnable.length === 0 && layout === "panel") return null;

  return (
    <Button
      type="button"
      size={layout === "header" ? "sm" : "sm"}
      variant={layout === "header" ? "success" : "outline"}
      className={cn("gap-1.5", layout === "panel" && "h-7 text-xs")}
      disabled={running}
      data-walkthrough={layout === "header" ? "ai-check" : undefined}
      data-testid={layout === "header" ? "run-all-review" : "review-run-all"}
      onClick={() => {
        onRun?.();
        void runChecks(undefined, categoryToRun);
      }}
    >
      {running ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Play className="size-3.5" aria-hidden="true" />
      )}
      {running
        ? "Running…"
        : layout === "header"
          ? "Run all checks"
          : category === "all"
            ? "Run all"
            : `Run ${categoryLabel(category)}`}
    </Button>
  );
}

function ReviewVerifyActions({ finding }: { finding: ReviewFindingDto }) {
  const {
    actions: { patchFinding },
    state: { canRun },
  } = useReview();
  if (finding.kind !== "needs_human" || !canRun || finding.id.startsWith("live:")) {
    return null;
  }
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[10px]"
        onClick={() => void patchFinding(finding.id, "verified")}
      >
        <CheckCircle2 className="size-3" />
        Mark verified
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[10px]"
        onClick={() => void patchFinding(finding.id, "dismissed")}
      >
        Dismiss
      </Button>
    </div>
  );
}

function ReviewIssueRow({
  finding,
  onJumpToComment,
  onJumpToSection,
}: {
  finding: ReviewFindingDto;
  onJumpToComment: (commentId: string) => void;
  onJumpToSection: (section: SectionType) => void;
}) {
  const { generateSuggestions, isSuggesting } = useReportEvaluations();

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2.5">
      <button
        type="button"
        className="w-full text-left text-xs leading-snug text-[var(--foreground)] hover:text-[var(--foreground)]"
        onClick={() => {
          if (finding.commentId) {
            onJumpToComment(finding.commentId);
            return;
          }
          if (finding.section) {
            onJumpToSection(finding.section as SectionType);
            const criterionKey =
              typeof finding.metadata.criterionKey === "string"
                ? finding.metadata.criterionKey
                : null;
            if (criterionKey && finding.checkId.startsWith("report.criteria.")) {
              void generateSuggestions(finding.section as SectionType);
            }
          }
        }}
      >
        {finding.message}
      </button>
      {finding.anchorText ? (
        <p className="mt-1 line-clamp-2 text-[11px] text-[var(--muted-foreground)]">
          {finding.anchorText}
        </p>
      ) : null}
      <ReviewVerifyActions finding={finding} />
      {finding.kind === "fixable" && !finding.commentId && isSuggesting ? (
        <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
          Generating a fix…
        </p>
      ) : null}
    </div>
  );
}

function ReviewIssueList({
  check,
  onJumpToComment,
  onJumpToPlaceholder,
  onJumpToSection,
}: {
  check: ReviewCheckDto;
  onJumpToComment: (commentId: string) => void;
  onJumpToPlaceholder: (placeholder: Placeholder) => void;
  onJumpToSection: (section: SectionType) => void;
}) {
  const { state } = useReview();
  if (check.id === "report.placeholders") {
    return <PlaceholdersPanelContent onJumpToPlaceholder={onJumpToPlaceholder} />;
  }
  const issues = state.findings.filter((row) => row.checkId === check.id);
  if (issues.length === 0) {
    return (
      <p className="px-1 py-2 text-[11px] italic text-[var(--muted-foreground)]">
        {check.status === "never_run"
          ? "Not run yet."
          : check.status === "clean"
            ? "No open issues."
            : "No open issues from the last run."}
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {issues.map((finding) => (
        <ReviewIssueRow
          key={finding.id}
          finding={finding}
          onJumpToComment={onJumpToComment}
          onJumpToSection={onJumpToSection}
        />
      ))}
    </div>
  );
}

function ReviewCheckCard({
  check,
  onJumpToComment,
  onJumpToPlaceholder,
  onJumpToSection,
}: {
  check: ReviewCheckDto;
  onJumpToComment: (commentId: string) => void;
  onJumpToPlaceholder: (placeholder: Placeholder) => void;
  onJumpToSection: (section: SectionType) => void;
}) {
  const {
    state: { openCheckId, runningCheckIds, canRun },
    actions: { toggleCheck, runChecks },
  } = useReview();
  const open = openCheckId === check.id;
  const running = runningCheckIds.includes(check.id);

  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden"
      data-testid={`review-check-${check.id}`}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => toggleCheck(check.id)}
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">{check.label}</span>
            <span className="rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {check.standardTag}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
            {check.description}
          </p>
          <p className="mt-1 text-[10px] font-medium text-[var(--muted-foreground)]">
            {statusLabel(check, running)}
          </p>
        </button>
        {check.kind === "run" && canRun ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2 text-[10px]"
            disabled={running}
            onClick={() => void runChecks([check.id])}
          >
            {running ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Play className="size-3" />
            )}
            Run
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="border-t border-[var(--border)] px-3 py-2">
          <ReviewIssueList
            check={check}
            onJumpToComment={onJumpToComment}
            onJumpToPlaceholder={onJumpToPlaceholder}
            onJumpToSection={onJumpToSection}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReviewCheckList({
  onJumpToComment,
  onJumpToPlaceholder,
  onJumpToSection,
}: {
  onJumpToComment: (commentId: string) => void;
  onJumpToPlaceholder: (placeholder: Placeholder) => void;
  onJumpToSection: (section: SectionType) => void;
}) {
  const { state } = useReview();
  const visible = state.checks.filter(
    (check) => state.category === "all" || check.category === state.category
  );
  if (state.loading && visible.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-[var(--muted-foreground)]">
        Loading review checks…
      </p>
    );
  }
  if (visible.length === 0) {
    return (
      <p className="py-8 text-center text-xs italic text-[var(--muted-foreground)]">
        No checks in this category.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {visible.map((check) => (
        <ReviewCheckCard
          key={check.id}
          check={check}
          onJumpToComment={onJumpToComment}
          onJumpToPlaceholder={onJumpToPlaceholder}
          onJumpToSection={onJumpToSection}
        />
      ))}
    </div>
  );
}

function ReviewPanel({
  onJumpToComment,
  onJumpToPlaceholder,
  onJumpToSection,
}: {
  onJumpToComment: (commentId: string) => void;
  onJumpToPlaceholder: (placeholder: Placeholder) => void;
  onJumpToSection: (section: SectionType) => void;
}) {
  return (
    <div className="space-y-3" data-testid="review-panel">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Review</h2>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Run checks, then open a card to work through its issues.
          </p>
        </div>
        <ReviewRunAll />
      </div>
      <ReviewCategoryTabs />
      <ReviewCheckList
        onJumpToComment={onJumpToComment}
        onJumpToPlaceholder={onJumpToPlaceholder}
        onJumpToSection={onJumpToSection}
      />
    </div>
  );
}

export const Review = {
  Provider: ReviewProvider,
  Panel: ReviewPanel,
  CategoryTabs: ReviewCategoryTabs,
  RunAll: ReviewRunAll,
  CheckCard: ReviewCheckCard,
  IssueList: ReviewIssueList,
  IssueRow: ReviewIssueRow,
  VerifyActions: ReviewVerifyActions,
};
