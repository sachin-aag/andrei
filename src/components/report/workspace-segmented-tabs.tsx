"use client";

import { cn } from "@/lib/utils";

export type WorkspaceSegmentedTab<T extends string> = {
  value: T;
  label: string;
  testId: string;
};

export function WorkspaceSegmentedTabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
}: {
  label: string;
  value: T;
  tabs: readonly WorkspaceSegmentedTab<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex shrink-0 rounded-md border border-[var(--border)] p-0.5"
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            data-testid={tab.testId}
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              selected
                ? "bg-[var(--secondary)] text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
