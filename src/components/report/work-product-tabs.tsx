"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasTabId, CanvasTabListItem } from "./work-product-canvas";

export function WorkProductTabs({
  tabs,
  value,
  onChange,
  onClose,
}: {
  tabs: readonly CanvasTabListItem[];
  value: CanvasTabId;
  onChange: (next: CanvasTabId) => void;
  onClose: (id: CanvasTabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Work product"
      data-testid="work-product-tab-strip"
      className="flex min-w-0 flex-1 items-end gap-0 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <div
            key={tab.id}
            role="tab"
            data-testid={tab.testId}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={tab.label}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onChange(tab.id);
              }
            }}
            className={cn(
              "flex max-w-[12rem] shrink-0 cursor-pointer items-center gap-1 border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors",
              selected
                ? "border-[var(--brand-600)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            <span className="truncate">{tab.label}</span>
            {tab.closable ? (
              <button
                type="button"
                aria-label={tab.closeAriaLabel ?? `Close ${tab.label}`}
                className="flex size-4 shrink-0 items-center justify-center rounded-sm text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
