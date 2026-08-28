"use client";

import { BarChart3, FileText, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkProductView } from "./workspace-chrome";

/** Collapsed right-hand work-product strip in Agent chrome (mirrors chat sidebar rail). */
export function AgentWorkProductRail({
  workProductView,
  statsEnabled,
  onSelectView,
  onExpand,
}: {
  workProductView: WorkProductView;
  statsEnabled: boolean;
  onSelectView: (view: WorkProductView) => void;
  onExpand: () => void;
}) {
  const tabs: {
    value: WorkProductView;
    label: string;
    testId: string;
    icon: typeof FileText;
  }[] = [
    {
      value: "report",
      label: "Report",
      testId: "report-surface-document",
      icon: FileText,
    },
    ...(statsEnabled
      ? [
          {
            value: "analytics" as const,
            label: "Analytics",
            testId: "report-surface-analytics",
            icon: BarChart3,
          },
        ]
      : []),
  ];

  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center border-l border-[var(--border)] bg-[var(--card)] py-2">
      <div className="flex w-full flex-col items-center gap-1 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = workProductView === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              data-testid={tab.testId}
              onClick={() => {
                onSelectView(tab.value);
                onExpand();
              }}
              aria-label={tab.label}
              aria-pressed={selected}
              title={tab.label}
              className={cn(
                "relative flex size-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
                selected
                  ? "border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--secondary)]/50 hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand document panel"
        aria-expanded={false}
        className="mt-1 flex size-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
        title="Expand"
      >
        <PanelRightOpen className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
