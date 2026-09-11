"use client";

import { useEffect, useRef } from "react";

export type BusyBrowserTabStatus =
  | { phase: "checking"; scanned?: number; total?: number }
  | { phase: "uploading"; current: number; total: number };

export function busyBrowserTabLabel(status: BusyBrowserTabStatus): string {
  switch (status.phase) {
    case "uploading":
      return `Uploading ${status.current} of ${status.total}`;
    case "checking":
      if ((status.total ?? 0) > 0 && (status.scanned ?? 0) > 0) {
        return `Checking ${status.scanned} of ${status.total}`;
      }
      if ((status.scanned ?? 0) > 0) {
        return `Checking ${status.scanned} files`;
      }
      return "Checking folder";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function busyBrowserTabTitle(
  originalTitle: string,
  status: BusyBrowserTabStatus
): string {
  const label = busyBrowserTabLabel(status);
  const base = originalTitle.trim();
  return base ? `${label} — ${base}` : label;
}

function brandStrokeColor(): string | null {
  if (typeof document === "undefined") return null;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--brand-600")
    .trim();
  return value || null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function drawSpinner(
  ctx: CanvasRenderingContext2D,
  angle: number,
  color: string
): void {
  const size = 32;
  ctx.clearRect(0, 0, size, size);
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(16, 16, 10, angle, angle + Math.PI * 1.35);
  ctx.stroke();
}

/**
 * Swap the tab favicon for a spinning brand arc while work is in flight.
 * Canvas is unavailable in some test environments — title still updates.
 */
export function startBusyFavicon(): () => void {
  if (typeof document === "undefined") return () => undefined;

  try {
    const color = brandStrokeColor();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx || !color) return () => undefined;

    const existing = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    const previousHref = existing?.getAttribute("href");
    const created = existing == null;
    const link = existing ?? document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    if (created) document.head.appendChild(link);

    const paint = (angle: number) => {
      drawSpinner(ctx, angle, color);
      link.href = canvas.toDataURL("image/png");
    };

    const restore = () => {
      if (created) {
        link.remove();
        return;
      }
      if (previousHref) {
        link.setAttribute("href", previousHref);
        return;
      }
      link.removeAttribute("href");
    };

    if (prefersReducedMotion()) {
      paint(0);
      return restore;
    }

    let angle = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      angle = (angle + 0.35) % (Math.PI * 2);
      paint(angle);
      timer = setTimeout(tick, 90);
    };
    tick();

    return () => {
      if (timer !== null) clearTimeout(timer);
      restore();
    };
  } catch {
    return () => undefined;
  }
}

/**
 * Puts a loading label (and favicon spinner) on the browser tab so an upload
 * is still visible after switching away from the vault page.
 */
export function useBusyBrowserTab(status: BusyBrowserTabStatus | null): void {
  const originalTitleRef = useRef<string | null>(null);
  const busy = status != null;
  const label = status ? busyBrowserTabLabel(status) : null;

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (status && label) {
      if (originalTitleRef.current === null) {
        originalTitleRef.current = document.title;
      }
      document.title = busyBrowserTabTitle(originalTitleRef.current, status);
      return;
    }

    if (originalTitleRef.current !== null) {
      document.title = originalTitleRef.current;
      originalTitleRef.current = null;
    }
  }, [busy, label, status]);

  useEffect(() => {
    return () => {
      if (originalTitleRef.current !== null && typeof document !== "undefined") {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    return startBusyFavicon();
  }, [busy]);
}
