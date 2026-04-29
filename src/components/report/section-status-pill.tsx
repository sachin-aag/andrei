"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useReport } from "@/providers/report-provider";
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
    runEvaluation,
    isEvaluating,
    pendingEvalSections,
    runningEvalSections,
  } = useReport();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => rowsForSection(section, evaluations), [evaluations, section]);
  const status = aggregateStatus(rows);
  const { met, total } = metCount(rows);
  const isPending = pendingEvalSections.includes(section);
  const isRunning = runningEvalSections.includes(section);

  // Auto-eval status badge: "checking" while in flight for this section,
  // "queued" when the idle timer is armed but hasn't fired yet.
  const autoStatus = isRunning
    ? { label: "AI checking…", spin: true }
    : isPending
    ? { label: "AI check queued", spin: false }
    : null;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--secondary)] cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn("size-2 rounded-full shrink-0", STATUS_COLOR[status])} />
        <span className="text-xs font-medium text-[var(--foreground)] truncate">
          {SECTION_LABELS[section] ?? section} · {met}/{total} met
        </span>
        {autoStatus ? (
          <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] truncate">
            {autoStatus.spin ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
            <span className="hidden sm:inline">{autoStatus.label}</span>
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

      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--secondary)]/30 px-2 py-2 space-y-1">
          {rows.map((row) => {
            const eff = effectiveStatus(row);
            return (
              <div
                key={row.criterionKey}
                className="flex items-start gap-2 px-2 py-1 rounded text-xs"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full mt-1.5 shrink-0",
                    STATUS_COLOR[eff]
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "leading-snug",
                      row.bypassed && "line-through text-[var(--muted-foreground)]",
                      !row.bypassed && STATUS_TEXT_COLOR[eff]
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
          <div className="pt-1.5 px-1">
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              disabled={isEvaluating}
              onClick={() => runEvaluation(section, { reason: "manual" })}
            >
              {isEvaluating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              Re-evaluate {SECTION_LABELS[section] ?? section}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
