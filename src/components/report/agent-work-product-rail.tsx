"use client";

import { BarChart3, FileText, PanelRightOpen } from "lucide-react";
import type { WorkProductView } from "./workspace-chrome";

/** Collapsed right-hand work-product strip in Agent chrome. Expand + last active tab. */
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
  const activeTab =
    tabs.find((tab) => tab.value === workProductView) ?? tabs[0]!;
  const ActiveIcon = activeTab.icon;

  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center bg-[var(--card)] py-2">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand document panel"
        aria-expanded={false}
        className="flex size-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
        title="Expand"
      >
        <PanelRightOpen className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid={activeTab.testId}
        onClick={() => {
          onSelectView(activeTab.value);
          onExpand();
        }}
        aria-label={activeTab.label}
        aria-pressed
        title={activeTab.label}
        className="relative mt-1 flex size-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      >
        <ActiveIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
