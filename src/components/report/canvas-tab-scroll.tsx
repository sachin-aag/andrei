"use client";

import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Per-tab canvas scroll for one user + report in this browser tab.
 * Session storage so returning to the report in the same login window
 * restores the last position; a new tab / window starts at the top.
 */
export const CANVAS_TAB_SCROLL_PREFIX = "canvasTabScroll:v1";

type ScrollMap = Record<string, number>;

const memory = new Map<string, ScrollMap>();

const CanvasTabScrollContext = createContext<{
  userId: string;
  reportId: string;
} | null>(null);

export function canvasTabScrollStorageKey(
  userId: string,
  reportId: string
): string {
  return `${CANVAS_TAB_SCROLL_PREFIX}:${userId}:${reportId}`;
}

export function resetCanvasTabScrollStore(): void {
  memory.clear();
}

function isFiniteScrollTop(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseCanvasTabScrollMap(raw: string | null): ScrollMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const next: ScrollMap = {};
    for (const [tabId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isFiniteScrollTop(value)) {
        next[tabId] = Math.round(value);
      }
    }
    return next;
  } catch {
    return {};
  }
}

function readFromSessionStorage(key: string): ScrollMap {
  try {
    if (typeof sessionStorage === "undefined") return {};
    return parseCanvasTabScrollMap(sessionStorage.getItem(key));
  } catch {
    return {};
  }
}

function writeToSessionStorage(key: string, map: ScrollMap): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Incognito / quota / disabled storage — memory still holds the positions.
  }
}

function mapFor(userId: string, reportId: string): ScrollMap {
  const key = canvasTabScrollStorageKey(userId, reportId);
  const cached = memory.get(key);
  if (cached) return cached;
  const stored = readFromSessionStorage(key);
  memory.set(key, stored);
  return stored;
}

export function readCanvasTabScrollTop(
  userId: string,
  reportId: string,
  tabId: string
): number | null {
  const value = mapFor(userId, reportId)[tabId];
  return isFiniteScrollTop(value) ? value : null;
}

export function writeCanvasTabScrollTop(
  userId: string,
  reportId: string,
  tabId: string,
  scrollTop: number
): void {
  if (!isFiniteScrollTop(scrollTop)) return;
  const key = canvasTabScrollStorageKey(userId, reportId);
  const current = mapFor(userId, reportId);
  const rounded = Math.round(scrollTop);
  if (current[tabId] === rounded) return;
  const next = { ...current, [tabId]: rounded };
  memory.set(key, next);
  writeToSessionStorage(key, next);
}

export function CanvasTabScrollProvider({
  userId,
  reportId,
  children,
}: {
  userId: string;
  reportId: string;
  children: ReactNode;
}) {
  return (
    <CanvasTabScrollContext value={{ userId, reportId }}>
      {children}
    </CanvasTabScrollContext>
  );
}

/**
 * Restore this element's scrollTop on mount and persist it while the
 * element is alive. No-op without a provider or tab id (unit tests).
 */
export function usePersistedScrollTop(
  tabId: string | undefined
): RefObject<HTMLDivElement | null> {
  const ctx = use(CanvasTabScrollContext);
  const ref = useRef<HTMLDivElement>(null);
  const userId = ctx?.userId;
  const reportId = ctx?.reportId;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !userId || !reportId || !tabId) return;
    const saved = readCanvasTabScrollTop(userId, reportId, tabId);
    if (saved == null) return;
    el.scrollTop = saved;
  }, [reportId, tabId, userId]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !userId || !reportId || !tabId) return;

    const persist = () => {
      writeCanvasTabScrollTop(userId, reportId, tabId, el.scrollTop);
    };
    el.addEventListener("scroll", persist, { passive: true });
    return () => {
      persist();
      el.removeEventListener("scroll", persist);
    };
  }, [reportId, tabId, userId]);

  return ref;
}
