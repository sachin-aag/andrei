"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { CANVAS_TAB_DRAG_MIME, writeCanvasTabDrag } from "./canvas-tab-drag";
import type { CanvasTabId, CanvasTabListItem } from "./work-product-canvas";

export function WorkProductTabs({
  tabs,
  value,
  onChange,
  onClose,
  menuFor,
  stripTestId,
  dragPaneId,
  dragCopiesTab,
  onTabDragStart,
  onTabDragEnd,
}: {
  tabs: readonly CanvasTabListItem[];
  value: CanvasTabId;
  onChange: (next: CanvasTabId) => void;
  onClose: (id: CanvasTabId) => void;
  menuFor?: (tab: CanvasTabListItem) => ReactNode;
  stripTestId?: string;
  /** When set, tabs can be dragged onto another pane. */
  dragPaneId?: string;
  dragCopiesTab?: (tabId: CanvasTabId) => boolean;
  onTabDragStart?: (tabId: CanvasTabId) => void;
  onTabDragEnd?: () => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Work product"
      data-testid={stripTestId ?? "work-product-tab-strip"}
      className="flex min-w-0 flex-1 items-end gap-0 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        const tabNode = (
          <div
            key={menuFor ? undefined : tab.id}
            role="tab"
            data-testid={tab.testId}
            data-walkthrough={
              tab.testId === "report-surface-analytics" ? "analytics" : undefined
            }
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={tab.label}
            draggable={dragPaneId != null}
            onDragStart={(event) => {
              if (!dragPaneId) return;
              event.dataTransfer.setData(
                CANVAS_TAB_DRAG_MIME,
                writeCanvasTabDrag(dragPaneId, tab.id)
              );
              event.dataTransfer.effectAllowed = dragCopiesTab?.(tab.id)
                ? "copy"
                : "move";
              onTabDragStart?.(tab.id);
            }}
            onDragEnd={() => onTabDragEnd?.()}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onChange(tab.id);
              }
            }}
            className={cn(
              "flex max-w-[12rem] shrink-0 items-center gap-1 border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors",
              dragPaneId != null ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
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
                draggable={false}
                onDragStart={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
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
        if (!menuFor) return tabNode;
        return (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger asChild>{tabNode}</ContextMenuTrigger>
            <ContextMenuContent>{menuFor(tab)}</ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
