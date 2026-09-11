"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePersistedScrollTop } from "./canvas-tab-scroll";

/**
 * One work-product canvas surface. Parked tabs stay mounted and use
 * visibility (not display:none) so nested scrollers keep scrollTop.
 */
export function CanvasTabPane({
  active,
  scrollable = false,
  scrollTabId,
  testId,
  className,
  children,
  ...rest
}: {
  active: boolean;
  scrollable?: boolean;
  scrollTabId?: string;
  testId?: string;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "role" | "className">) {
  const scrollRef = usePersistedScrollTop(scrollable ? scrollTabId : undefined);

  return (
    <div
      {...rest}
      ref={scrollRef}
      role="tabpanel"
      inert={!active || undefined}
      aria-hidden={!active}
      data-testid={testId}
      data-canvas-pane={active ? "active" : "parked"}
      className={cn(
        "absolute inset-0 flex min-h-0 min-w-0 flex-col",
        active ? "z-10" : "invisible pointer-events-none z-0",
        scrollable ? "overflow-auto overscroll-contain" : "overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}
