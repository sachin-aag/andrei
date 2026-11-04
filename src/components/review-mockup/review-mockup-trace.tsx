"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TRACE_ROWS, TRACE_SUMMARY, type TraceRow } from "@/lib/review-mockup/sample-data";
import { useReviewMockup } from "./review-mockup-state";

function statusClass(row: TraceRow): string {
  switch (row.status) {
    case "verified":
    case "overheat":
      return "text-emerald-700";
    case "criterion_subjective":
    case "wider_than_input":
      return "text-amber-700";
    case "no_test":
    case "claimed_elsewhere":
      return "text-red-700";
    default: {
      const _exhaustive: never = row.status;
      return _exhaustive;
    }
  }
}

const TRACE_FINDING: Record<string, string> = {
  "DI-038": "di-038",
  "RC-12": "rc-12",
  "DI-034": "tm-02-subjective",
  "DI-036": "tm-03-wider",
};

export function TracePanel() {
  const { scrollToAnchor, selectedFindingId, showFinding } = useReviewMockup();

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Design inputs &amp; risk controls → tests
      </p>
      <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Live from DIS-0088 Rev D and RMF-0019 Rev C. It updates as you edit §7.
      </p>
      <ul className="space-y-1.5" data-testid="review-trace-list">
        {TRACE_ROWS.map((row) => {
          const findingId = TRACE_FINDING[row.id];
          const active = Boolean(findingId && selectedFindingId === findingId);
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  if (findingId) showFinding(findingId);
                  else if (row.anchorId) scrollToAnchor(row.anchorId);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-left text-xs",
                  row.gap && "border-red-600/40",
                  active && "outline outline-2 outline-offset-1 outline-[var(--ring)]"
                )}
              >
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-semibold",
                    row.gap
                      ? "bg-red-600/10 text-red-700"
                      : "bg-[var(--secondary)] text-[var(--foreground)]"
                  )}
                >
                  {row.source}
                </span>
                <span className="text-[var(--muted-foreground)]">→</span>
                <span className="min-w-0 flex-1 truncate">
                  {row.test ?? "—"}
                </span>
                <span className={cn("shrink-0 font-medium", statusClass(row))}>
                  {row.statusLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-emerald-700/15 px-2 py-0.5 font-medium text-emerald-800">
          {TRACE_SUMMARY.traced} traced
        </span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800">
          {TRACE_SUMMARY.weak} weak
        </span>
        <span className="rounded-full bg-red-600/10 px-2 py-0.5 font-medium text-red-700">
          {TRACE_SUMMARY.gaps} gaps
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            showFinding("di-038");
          }}
        >
          Show gap in document
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => toast.success("Trace matrix copied")}
        >
          Export matrix
        </Button>
      </div>
    </div>
  );
}
