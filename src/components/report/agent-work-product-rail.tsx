"use client";

import { BarChart3, FileText, PanelRightOpen } from "lucide-react";
import type { WorkProductView } from "./workspace-chrome";

/** Collapsed right-hand work-product strip in Agent chrome. */
export function AgentWorkProductRail({
  workProductView,
  onExpand,
}: {
  workProductView: WorkProductView;
  onExpand: () => void;
}) {
  const isAnalytics = workProductView === "analytics";

  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center border-l border-[var(--border)] bg-[var(--card)] py-2">
      <button
        type="button"
        onClick={onExpand}
        aria-label={isAnalytics ? "Analytics" : "Report"}
        aria-expanded={false}
        title={isAnalytics ? "Analytics" : "Report"}
        className="relative flex size-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      >
        {isAnalytics ? (
          <BarChart3 className="size-4" aria-hidden="true" />
        ) : (
          <FileText className="size-4" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand document panel"
        className="mt-1 flex size-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
        title="Expand"
      >
        <PanelRightOpen className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
