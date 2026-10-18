"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePersistedScrollTop } from "./canvas-tab-scroll";

/**
 * One work-product canvas surface. Parked tabs stay mounted and use
 * visibility (not display:none) so nested scrollers keep scrollTop.
 * `header` sits outside the scroller so view-only chrome stays pinned.
 */
export function CanvasTabPane({
  active,
  scrollable = false,
  scrollTabId,
  testId,
  className,
  header,
  children,
  ...rest
}: {
  active: boolean;
  scrollable?: boolean;
  scrollTabId?: string;
  testId?: string;
  className?: string;
  /** Pinned above the tab body; does not scroll with `scrollable` content. */
  header?: ReactNode;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "role" | "className">) {
  const scrollRef = usePersistedScrollTop(scrollable ? scrollTabId : undefined);

  return (
    <div
      role="tabpanel"
      inert={!active || undefined}
      aria-hidden={!active}
      data-testid={testId}
      data-canvas-pane={active ? "active" : "parked"}
      className={cn(
        "absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden",
        active ? "z-10" : "invisible pointer-events-none z-0",
        className
      )}
    >
      {header ? <div className="shrink-0">{header}</div> : null}
      <div
        {...rest}
        ref={scrollRef}
        data-canvas-pane-scroll=""
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          scrollable ? "overflow-auto overscroll-contain" : "overflow-hidden"
        )}
      >
        {children}
      </div>
    </div>
  );
}
