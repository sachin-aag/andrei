"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import {
  useReportComments,
  useReportData,
  useReportEvaluations,
  useReportSections,
} from "@/providers/report-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SectionType } from "@/db/schema";
import {
  STATUS_COLOR,
  STATUS_TEXT_COLOR,
  aggregateStatus,
  effectiveStatus,
  evaluatableSectionKeys,
  metCount,
  rowsForSection,
} from "@/lib/ai/criteria-view";
import { canSuggestFixes } from "@/lib/ai/suggestion-gating";
import { canSaveReportSection } from "@/lib/reports/access";
import { useUserDirectory } from "@/providers/user-directory-provider";
import { displaySectionLabel } from "@/types/sections";
import { captureEvent } from "@/lib/analytics/events";
import { getDocumentType } from "@/lib/document-types";
import { getCustomerPack } from "@/lib/customers/packs";

const STATUS_LABEL = {
  met: "All criteria met",
  partially_met: "Partially met",
  not_met: "Issues to address",
  not_evaluated: "Not evaluated yet",
} as const;

/** First overflow-y ancestor, else the document. */
export function nearestVerticalScroller(node: HTMLElement): HTMLElement {
  let current: HTMLElement | null = node.parentElement;
  while (current) {
    const overflowY = getComputedStyle(current).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return current;
    }
    current = current.parentElement;
  }
  return document.documentElement;
}

/** True when `el` sits entirely above the scroller's visible top edge. */
export function isCompletelyAboveScroller(
  el: HTMLElement,
  scroller: HTMLElement
): boolean {
  const elRect = el.getBoundingClientRect();
  const viewTop =
    scroller === document.documentElement || scroller === document.body
      ? 0
      : scroller.getBoundingClientRect().top;
  return elRect.bottom < viewTop;
}

export function keepViewportAfterGrowth(
  scroller: HTMLElement,
  heightBefore: number,
  heightAfter: number,
  scrollBefore: number
): void {
  const delta = heightAfter - heightBefore;
  if (delta === 0) return;
  scroller.scrollTop = scrollBefore + delta;
}

type PendingScrollFix = {
  scroller: HTMLElement;
  heightBefore: number;
  scrollBefore: number;
};

function ExpandableReasoning({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      className="mt-0.5 w-full flex items-start gap-1 text-left text-[11px] text-[var(--muted-foreground)] leading-snug hover:text-[var(--foreground)] cursor-pointer"
    >
      {expanded ? (
        <ChevronDown className="size-3 mt-0.5 shrink-0" />
      ) : (
        <ChevronRight className="size-3 mt-0.5 shrink-0" />
      )}
      <span className={cn("flex-1 min-w-0", !expanded && "line-clamp-2")}>
        {text}
      </span>
    </button>
  );
}

export function SectionStatusPill({ section }: { section: SectionType }) {
  const { report, workspaceMode } = useReportData();
  const {
    evaluations,
    runningEvalSections,
  } = useReportEvaluations();
  const [open, setOpen] = useState(false);
  const showAiActions = workspaceMode !== "view";
  const rows = useMemo(
    () => rowsForSection(section, evaluations, report.documentType),
    [evaluations, section, report.documentType]
  );
  const isRunning = runningEvalSections.includes(section);
  const [stableRows, setStableRows] = useState(rows);
  const rootRef = useRef<HTMLDivElement>(null);
  const wasRunningRef = useRef(isRunning);
  const pendingScrollFixRef = useRef<PendingScrollFix | null>(null);

  if (!isRunning && stableRows !== rows) {
    setStableRows(rows);
  }

  useLayoutEffect(() => {
    const justFinished = wasRunningRef.current && !isRunning;
    wasRunningRef.current = isRunning;

    if (justFinished && !open) {
      const el = rootRef.current;
      if (el) {
        const scroller = nearestVerticalScroller(el);
        if (isCompletelyAboveScroller(el, scroller)) {
          pendingScrollFixRef.current = {
            scroller,
            heightBefore: el.offsetHeight,
            scrollBefore: scroller.scrollTop,
          };
        }
      }
      setOpen(true);
      return;
    }

    const fix = pendingScrollFixRef.current;
    if (!fix || !open) return;
    pendingScrollFixRef.current = null;
    const el = rootRef.current;
    if (!el) return;
    keepViewportAfterGrowth(
      fix.scroller,
      fix.heightBefore,
      el.offsetHeight,
      fix.scrollBefore
    );
  }, [isRunning, open]);

  const displayRows = isRunning ? stableRows : rows;
  const status = aggregateStatus(displayRows);
  const { met, total } = metCount(displayRows);

  if (total === 0 && !isRunning) return null;

  return (
    <div
      ref={rootRef}
      className="rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--secondary)]">
        <button
          type="button"
          className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span
            className={cn(
              "size-2 rounded-full shrink-0 transition-opacity",
              STATUS_COLOR[status],
              isRunning && "opacity-40"
            )}
            title={isRunning ? "Showing previous result while AI checks this section" : undefined}
          />
          <span
            className={cn(
              "text-xs font-medium text-[var(--foreground)] truncate transition-opacity",
              isRunning && "opacity-60"
            )}
          >
            {displaySectionLabel(section)} · {met}/{total} met
          </span>
          {isRunning ? (
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] truncate">
              <Loader2 className="size-3 animate-spin" />
              <span className="hidden sm:inline">AI checking…</span>
            </span>
          ) : (
            <span className="text-[10px] text-[var(--muted-foreground)] hidden sm:inline truncate">
              {STATUS_LABEL[status]}
            </span>
          )}
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 text-[var(--muted-foreground)] transition-transform shrink-0",
              open && "rotate-180"
            )}
          />
        </button>
      </div>

      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--secondary)]/30 px-2 py-2 space-y-1">
          {displayRows.map((row) => {
            const eff = effectiveStatus(row);
            return (
              <div
                key={row.criterionKey}
                className="flex items-start gap-2 px-2 py-1 rounded text-xs"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full mt-1.5 shrink-0 transition-opacity",
                    STATUS_COLOR[eff],
                    isRunning && "opacity-40"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "leading-snug transition-opacity",
                      STATUS_TEXT_COLOR[eff],
                      isRunning && "opacity-60"
                    )}
                  >
                    {row.criterionLabel}
                  </div>
                  {row.reasoning && (
                    <ExpandableReasoning text={row.reasoning} />
                  )}
                </div>
              </div>
            );
          })}
          {showAiActions ? <SectionSuggestFixesButton section={section} /> : null}
        </div>
      )}
    </div>
  );
}

function StackedAndreiButton({
  primary,
  disabled,
  onClick,
  spinning,
  title,
}: {
  primary: string;
  disabled?: boolean;
  onClick: () => void;
  spinning?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-auto shrink-0 py-1.5 px-2.5 text-xs bg-[var(--card)] shadow-sm flex flex-col items-center gap-0 leading-tight"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {spinning ? (
        <Loader2 className="size-3 animate-spin mb-0.5" />
      ) : (
        <Sparkles className="size-3 mb-0.5" />
      )}
      <span>{primary}</span>
      <span className="text-[9px] text-[var(--muted-foreground)] font-normal">
        {getCustomerPack().branding.aiAttribution}
      </span>
    </Button>
  );
}

export function SectionRunEvaluationButton({ section }: { section: SectionType }) {
  const { report } = useReportData();
  const {
    runEvaluation,
    isEvaluating,
    runningEvalSections,
  } = useReportEvaluations();
  if (!evaluatableSectionKeys(report.documentType).includes(section)) {
    return null;
  }
  const isRunning = runningEvalSections.includes(section);

  return (
    <StackedAndreiButton
      primary={isRunning ? "Running…" : "Run criteria"}
      disabled={isEvaluating}
      spinning={isRunning}
      onClick={() => {
        captureEvent("ai_evaluation_run", { section, scope: "single" });
        runEvaluation(section);
      }}
    />
  );
}

export function SectionSuggestFixesButton({ section }: { section: SectionType }) {
  const {
    generateSuggestions,
    isEvaluating,
    isSuggesting,
    runningEvalSections,
    runningSuggestionSections,
    evaluations,
  } = useReportEvaluations();
  const { comments } = useReportComments();
  const { sections } = useReportSections();
  const { report, currentUserId } = useReportData();
  const { getUser } = useUserDirectory();
  const user = getUser(currentUserId);
  const role = user?.role;
  const accessUser =
    role != null && user
      ? { id: currentUserId, role, email: user.email }
      : null;
  const canPropose =
    accessUser != null && canSaveReportSection(accessUser, report);
  const isRunning = runningSuggestionSections.includes(section);
  // Cover page criteria hash report.metadata (same as evaluate), not empty section JSON.
  const sectionContent =
    section === "cover_page" ? report.metadata : sections[section];
  const enabled =
    canPropose &&
    canSuggestFixes(section, evaluations, comments, sectionContent, {
      isEvaluating: isEvaluating || runningEvalSections.includes(section),
      isSuggesting: isSuggesting || isRunning,
      documentType: report.documentType,
      allSections: sections,
    });

  // Hide when it would be a disabled no-op. Keep the in-flight label after click.
  if (!enabled && !isRunning) return null;

  return (
    <div className="pt-1.5 mt-1 border-t border-[var(--border)]">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-auto w-full justify-center py-1.5 px-2.5 text-xs bg-[var(--card)] shadow-sm [&_svg]:size-3"
        disabled={!enabled}
        aria-busy={isRunning}
        aria-label={isRunning ? "Suggesting fixes" : "Suggest fixes"}
        title={isRunning ? "Generating suggested fixes…" : undefined}
        onClick={(event) => {
          event.stopPropagation();
          captureEvent("ai_suggestion_generated", { section });
          void generateSuggestions(section);
        }}
      >
        {isRunning ? (
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-3" aria-hidden="true" />
        )}
        <span>{isRunning ? "Suggesting…" : "Suggest fixes"}</span>
        <span
          className="text-[9px] text-[var(--muted-foreground)] font-normal"
          aria-hidden="true"
        >
          {getCustomerPack().branding.aiAttribution}
        </span>
      </Button>
    </div>
  );
}

export function RunAllEvaluationButton({
  size = "sm",
  variant = "success",
  className,
  layout = "compact",
}: {
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "default" | "success";
  className?: string;
  /** `compact` for the report header; `inline` names the scope for tight panels. */
  layout?: "compact" | "inline";
}) {
  const { report } = useReportData();
  const {
    runEvaluation,
    isEvaluating,
    runningEvalSections,
  } = useReportEvaluations();

  const sectionCount = evaluatableSectionKeys(report.documentType).length;
  if (sectionCount === 0) return null;
  const typeLabel = getDocumentType(report.documentType).label;
  const title = `Run traffic-light criteria on all ${sectionCount} sections (${typeLabel}) · ${getCustomerPack().branding.aiAttribution}`;

  const icon = isEvaluating ? (
    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
  ) : (
    <Sparkles className="size-4 shrink-0" aria-hidden="true" />
  );

  const label = isEvaluating
    ? runningEvalSections.length > 0
      ? `Checking… ${runningEvalSections.length} left`
      : "Checking all sections…"
    : layout === "inline"
      ? "Run criteria — all sections"
      : "Run criteria";

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn("gap-1.5", className)}
      disabled={isEvaluating}
      data-walkthrough="ai-check"
      onClick={() => {
        captureEvent("ai_evaluation_run", { scope: "all" });
        runEvaluation();
      }}
      title={title}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Button>
  );
}
