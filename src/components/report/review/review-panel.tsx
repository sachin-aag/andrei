"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  REVIEW_CATEGORIES,
  REVIEW_SEVERITY_CHIP_CLASS,
  REVIEW_SEVERITY_LABEL,
  REVIEW_SEVERITY_ORDER,
  categoryLabel,
  coerceReviewSeverity,
  compareSeverityDesc,
  countFindingSeverities,
  sortCategoriesBySeverity,
  worstSeverity,
  type ReviewCategory,
  type ReviewCheckDto,
  type ReviewCheckId,
  type ReviewFindingDto,
  type ReviewSeverityCounts,
} from "@/lib/review";
import { useReportEvaluations } from "@/providers/report-provider";
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

function ReviewSeverityChips({
  counts,
  showZeros = false,
  labeled = false,
  testId,
}: {
  counts: ReviewSeverityCounts;
  showZeros?: boolean;
  labeled?: boolean;
  testId?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid={testId}>
      {REVIEW_SEVERITY_ORDER.map((severity) => {
        const count = counts[severity];
        if (!showZeros && count === 0) return null;
        return (
          <span
            key={severity}
            title={`${count} ${REVIEW_SEVERITY_LABEL[severity].toLowerCase()}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full font-bold",
              REVIEW_SEVERITY_CHIP_CLASS[severity],
              labeled ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[9px]",
              count === 0 && "opacity-40"
            )}
          >
            {labeled ? `${REVIEW_SEVERITY_LABEL[severity]} ${count}` : count}
          </span>
        );
      })}
    </span>
  );
}

function findingsForCheck(
  findings: ReviewFindingDto[],
  checkId: string
): ReviewFindingDto[] {
  return findings.filter((row) => row.checkId === checkId);
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

function ReviewSeverityStats({ layout = "panel" }: { layout?: "panel" | "header" }) {
  const {
    state: { findings },
  } = useReview();
  const counts = countFindingSeverities(findings);
  if (layout === "header" && counts.critical + counts.major + counts.minor === 0) {
    return null;
  }
  return (
    <ReviewSeverityChips
      counts={counts}
      showZeros={layout === "panel"}
      labeled={layout === "panel"}
      testId={layout === "panel" ? "review-severity-stats" : "review-header-severity-stats"}
    />
  );
}

function ReviewCategoryTabs() {
  const {
    state: { category, checks, findings },
    actions: { setCategory },
  } = useReview();
  const countsByCategory = useMemo(() => {
    const byCategory = new Map<ReviewCategory, ReviewSeverityCounts>();
    for (const check of checks) {
      const existing = byCategory.get(check.category) ?? {
        critical: 0,
        major: 0,
        minor: 0,
      };
      const next = countFindingSeverities(findingsForCheck(findings, check.id));
      byCategory.set(check.category, {
        critical: existing.critical + next.critical,
        major: existing.major + next.major,
        minor: existing.minor + next.minor,
      });
    }
    return byCategory;
  }, [checks, findings]);

  const visibleCategories = sortCategoriesBySeverity(
    REVIEW_CATEGORIES.filter((id) =>
      checks.some((check) => check.category === id)
    ),
    (id) => countsByCategory.get(id) ?? { critical: 0, major: 0, minor: 0 }
  );

  const tabs: Array<{
    id: ReviewCategoryFilter;
    label: string;
    counts: ReviewSeverityCounts;
  }> = [
    {
      id: "all",
      label: "All checks",
      counts: countFindingSeverities(findings),
    },
    ...visibleCategories.map((id) => ({
      id,
      label: categoryLabel(id),
      counts: countsByCategory.get(id) ?? { critical: 0, major: 0, minor: 0 },
    })),
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="tablist"
      aria-label="Review categories"
    >
      {tabs.map((tab) => {
        const selected = category === tab.id;
        const worst = worstSeverity(tab.counts);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setCategory(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              selected
                ? "border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/50 hover:text-[var(--foreground)]",
              worst === "critical" && !selected && "text-red-700",
              worst === "major" && !selected && "text-amber-700",
              worst === "minor" && !selected && "text-sky-700"
            )}
          >
            {tab.label}
            <ReviewSeverityChips counts={tab.counts} />
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
  const severity = coerceReviewSeverity(finding.severity);

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            REVIEW_SEVERITY_CHIP_CLASS[severity]
          )}
        >
          {REVIEW_SEVERITY_LABEL[severity]}
        </span>
      </div>
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
  onJumpToSection,
}: {
  check: ReviewCheckDto;
  onJumpToComment: (commentId: string) => void;
  onJumpToSection: (section: SectionType) => void;
}) {
  const { state } = useReview();
  const issues = findingsForCheck(state.findings, check.id).toSorted((a, b) =>
    compareSeverityDesc(a.severity, b.severity)
  );
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
  onJumpToSection,
}: {
  check: ReviewCheckDto;
  onJumpToComment: (commentId: string) => void;
  onJumpToSection: (section: SectionType) => void;
}) {
  const {
    state: { openCheckId, runningCheckIds, canRun, findings },
    actions: { toggleCheck, runChecks },
  } = useReview();
  const open = openCheckId === check.id;
  const running = runningCheckIds.includes(check.id);
  const counts = countFindingSeverities(findingsForCheck(findings, check.id));

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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{check.label}</span>
            <span className="rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {check.standardTag}
            </span>
            <ReviewSeverityChips counts={counts} />
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
            onJumpToSection={onJumpToSection}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReviewCheckList({
  onJumpToComment,
  onJumpToSection,
}: {
  onJumpToComment: (commentId: string) => void;
  onJumpToSection: (section: SectionType) => void;
}) {
  const { state } = useReview();
  const visible = state.checks
    .filter(
      (check) => state.category === "all" || check.category === state.category
    )
    .toSorted((left, right) => {
      const leftCounts = countFindingSeverities(
        findingsForCheck(state.findings, left.id)
      );
      const rightCounts = countFindingSeverities(
        findingsForCheck(state.findings, right.id)
      );
      const leftWorst = worstSeverity(leftCounts);
      const rightWorst = worstSeverity(rightCounts);
      const leftRank = leftWorst
        ? leftWorst === "critical"
          ? 0
          : leftWorst === "major"
            ? 1
            : 2
        : 3;
      const rightRank = rightWorst
        ? rightWorst === "critical"
          ? 0
          : rightWorst === "major"
            ? 1
            : 2
        : 3;
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (leftWorst) {
        const delta = rightCounts[leftWorst] - leftCounts[leftWorst];
        if (delta !== 0) return delta;
      }
      return 0;
    });
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
          onJumpToSection={onJumpToSection}
        />
      ))}
    </div>
  );
}

function ReviewPanel({
  onJumpToComment,
  onJumpToSection,
}: {
  onJumpToComment: (commentId: string) => void;
  onJumpToSection: (section: SectionType) => void;
}) {
  return (
    <div className="space-y-3" data-testid="review-panel">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-sm font-semibold">Review</h2>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Run checks, then open a card to work through its issues.
          </p>
          <ReviewSeverityStats />
        </div>
        <ReviewRunAll />
      </div>
      <ReviewCategoryTabs />
      <ReviewCheckList
        onJumpToComment={onJumpToComment}
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
  SeverityStats: ReviewSeverityStats,
  CheckCard: ReviewCheckCard,
  IssueList: ReviewIssueList,
  IssueRow: ReviewIssueRow,
  VerifyActions: ReviewVerifyActions,
};
