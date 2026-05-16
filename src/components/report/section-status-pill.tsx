"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useReportEvaluations } from "@/providers/report-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SectionType } from "@/db/schema";
import {
  STATUS_COLOR,
  STATUS_TEXT_COLOR,
  aggregateStatus,
  effectiveStatus,
  metCount,
  rowsForSection,
} from "@/lib/ai/criteria-view";
import { SECTION_LABELS } from "@/types/sections";

const STATUS_LABEL = {
  met: "All criteria met",
  partially_met: "Partially met",
  not_met: "Issues to address",
  not_evaluated: "Not evaluated yet",
} as const;

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
  const {
    evaluations,
    runningEvalSections,
  } = useReportEvaluations();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => rowsForSection(section, evaluations), [evaluations, section]);
  const isRunning = runningEvalSections.includes(section);
  const [stableRows, setStableRows] = useState(rows);

  if (!isRunning && stableRows !== rows) {
    setStableRows(rows);
  }

  const displayRows = isRunning ? stableRows : rows;
  const status = aggregateStatus(displayRows);
  const { met, total } = metCount(displayRows);

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden">
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
            {SECTION_LABELS[section] ?? section} · {met}/{total} met
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
        </div>
      )}
    </div>
  );
}

export function SectionRunEvaluationButton({ section }: { section: SectionType }) {
  const {
    runEvaluation,
    isEvaluating,
    runningEvalSections,
  } = useReportEvaluations();
  const isRunning = runningEvalSections.includes(section);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 shrink-0 text-xs bg-[var(--card)] shadow-sm"
      disabled={isEvaluating}
      onClick={() => runEvaluation(section)}
    >
      {isRunning ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Sparkles className="size-3" />
      )}
      Run it by Andrei
    </Button>
  );
}

export function RunAllEvaluationButton({
  size = "sm",
  variant = "success",
  className,
}: {
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "default" | "success";
  className?: string;
}) {
  const {
    runEvaluation,
    isEvaluating,
    runningEvalSections,
  } = useReportEvaluations();

  const label = isEvaluating
    ? runningEvalSections.length > 0
      ? `Checking… ${runningEvalSections.length} left`
      : "Checking…"
    : "Run all by Andrei";

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      disabled={isEvaluating}
      onClick={() => runEvaluation()}
      title="Run AI checks across every section"
    >
      {isEvaluating ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Sparkles className="size-4" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}
