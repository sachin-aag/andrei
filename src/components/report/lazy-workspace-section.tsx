"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type MountKind = "urgent" | "prefetch" | "warmup";

type MountJob = {
  id: string;
  run: () => void;
  kind: MountKind;
  shouldRun?: () => boolean;
  distance?: () => number;
};

const VIEWPORT_MARGIN_PX = 160;
/** Contents waits this long for the target editor before scrolling anyway. */
export const JUMP_SCROLL_WAIT_MS = 1500;

const MOUNT_YIELD_MS = 50;
const SCROLL_QUIET_MS = 200;
const WARMUP_IDLE_TIMEOUT_MS = 4000;
const IS_TEST = process.env.VITEST === "true";

const mountQueue: MountJob[] = [];
let flushing = false;
let inFlight = false;
let allowBackgroundMounts = false;
let rafHandle = 0;
let idleHandle = 0;
let yieldHandle = 0;
let jumpTarget: string | null = null;
let jumpTimer = 0;
let scrollQuiet = true;
let scrollEndTimer = 0;
const mountedSectionIds = new Set<string>();
const readyWaiters = new Map<string, Set<() => void>>();
const sectionMountListeners = new Set<(id: string) => void>();
const sectionWarmupListeners = new Set<() => void>();
const prefetchCandidates = new Set<{
  id: string;
  mounted: () => boolean;
  queue: () => void;
  distance: () => number;
  isNear: () => boolean;
}>();

function kindRank(kind: MountKind): number {
  switch (kind) {
    case "urgent":
      return 0;
    case "prefetch":
      return 1;
    case "warmup":
      return 2;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function isNearViewport(el: Element | null): boolean {
  if (!el || typeof window === "undefined") return false;
  const rect = el.getBoundingClientRect();
  const viewH = window.innerHeight || 0;
  return (
    rect.bottom >= -VIEWPORT_MARGIN_PX && rect.top <= viewH + VIEWPORT_MARGIN_PX
  );
}

function distanceToViewportTop(el: Element | null): number {
  if (!el) return Number.POSITIVE_INFINITY;
  return Math.abs(el.getBoundingClientRect().top);
}

function cancelScheduledFlush() {
  if (rafHandle) {
    cancelAnimationFrame(rafHandle);
    rafHandle = 0;
  }
  if (idleHandle) {
    if (typeof cancelIdleCallback === "function") {
      cancelIdleCallback(idleHandle);
    }
    idleHandle = 0;
  }
  if (yieldHandle) {
    clearTimeout(yieldHandle);
    yieldHandle = 0;
  }
}

function kickIdleOrFrame() {
  if (typeof requestIdleCallback === "function") {
    idleHandle = requestIdleCallback(flush, {
      timeout: IS_TEST ? 200 : WARMUP_IDLE_TIMEOUT_MS,
    });
    return;
  }
  rafHandle = requestAnimationFrame(flush);
}

function scheduleFlush() {
  if (inFlight) return;
  if (mountQueue.length === 0) {
    flushing = false;
    return;
  }
  const urgent = mountQueue[0]?.kind === "urgent";
  if (!scrollQuiet && !urgent) {
    flushing = false;
    return;
  }
  flushing = true;
  if (urgent) {
    cancelScheduledFlush();
    rafHandle = requestAnimationFrame(flush);
    return;
  }
  if (rafHandle || idleHandle || yieldHandle) return;
  // A 200ms idle timeout was forcing the next TipTap while the tab was
  // still busy, so paint, chat, and even refresh could not run.
  if (IS_TEST || typeof requestIdleCallback !== "function") {
    kickIdleOrFrame();
    return;
  }
  yieldHandle = window.setTimeout(() => {
    yieldHandle = 0;
    if (!scrollQuiet) {
      flushing = false;
      return;
    }
    kickIdleOrFrame();
  }, MOUNT_YIELD_MS);
}

function dropPrefetchJobs() {
  for (let i = mountQueue.length - 1; i >= 0; i--) {
    if (mountQueue[i]?.kind === "prefetch") mountQueue.splice(i, 1);
  }
}

function insertJob(job: MountJob) {
  const existingAt = mountQueue.findIndex((queued) => queued.id === job.id);
  if (existingAt !== -1) {
    const existing = mountQueue[existingAt]!;
    if (kindRank(existing.kind) < kindRank(job.kind)) return;
    mountQueue.splice(existingAt, 1);
  }
  if (job.kind === "prefetch") {
    const otherPrefetch = mountQueue.findIndex(
      (queued) => queued.kind === "prefetch"
    );
    if (otherPrefetch !== -1) {
      const other = mountQueue[otherPrefetch]!;
      const nextDist = job.distance?.() ?? Number.POSITIVE_INFINITY;
      const prevDist = other.distance?.() ?? Number.POSITIVE_INFINITY;
      if (nextDist >= prevDist) return;
      mountQueue.splice(otherPrefetch, 1);
    }
  }
  if (job.kind === "urgent") {
    mountQueue.unshift(job);
    return;
  }
  if (job.kind === "prefetch") {
    const warmupAt = mountQueue.findIndex((queued) => queued.kind === "warmup");
    if (warmupAt === -1) mountQueue.push(job);
    else mountQueue.splice(warmupAt, 0, job);
    return;
  }
  mountQueue.push(job);
}

function prefetchClosestVisible() {
  if (!allowBackgroundMounts || jumpTarget || inFlight) return;
  if (mountQueue.some((job) => job.kind === "prefetch" || job.kind === "urgent")) {
    return;
  }
  let best: { dist: number; queue: () => void } | null = null;
  for (const candidate of prefetchCandidates) {
    if (candidate.mounted() || !candidate.isNear()) continue;
    const dist = candidate.distance();
    if (!best || dist < best.dist) best = { dist, queue: candidate.queue };
  }
  best?.queue();
}

function flush() {
  rafHandle = 0;
  idleHandle = 0;
  yieldHandle = 0;
  const next = mountQueue.shift();
  if (!next) {
    flushing = false;
    return;
  }
  if (next.shouldRun && !next.shouldRun()) {
    flushing = false;
    if (mountQueue.length > 0) scheduleFlush();
    return;
  }
  inFlight = true;
  try {
    next.run();
  } finally {
    flushing = false;
  }
}

function resolveReadyWaiters(id: string) {
  const waiters = readyWaiters.get(id);
  if (!waiters) return;
  readyWaiters.delete(id);
  for (const waiter of waiters) waiter();
}

function markSectionMounted(id: string) {
  mountedSectionIds.add(id);
  inFlight = false;
  if (jumpTarget === id) {
    jumpTarget = null;
    if (typeof window !== "undefined") window.clearTimeout(jumpTimer);
  }
  resolveReadyWaiters(id);
  if (mountQueue.length > 0) scheduleFlush();
}

function whenWorkspaceSectionReady(
  id: string,
  timeoutMs: number
): Promise<void> {
  if (mountedSectionIds.has(id)) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (typeof window !== "undefined") window.clearTimeout(timer);
      readyWaiters.get(id)?.delete(finish);
      if (readyWaiters.get(id)?.size === 0) readyWaiters.delete(id);
      resolve();
    };
    let waiters = readyWaiters.get(id);
    if (!waiters) {
      waiters = new Set();
      readyWaiters.set(id, waiters);
    }
    waiters.add(finish);
    const timer =
      typeof window === "undefined"
        ? 0
        : window.setTimeout(finish, timeoutMs);
  });
}

/**
 * One TipTap section at a time. Urgent jobs (first paint, Contents jump)
 * use animation frames; prefetch and warmup wait for an idle gap so
 * scrolling stays usable.
 */
export function enqueueLazyWorkspaceMount(
  mount: () => void,
  opts: {
    id: string;
    kind: MountKind;
    shouldRun?: () => boolean;
    distance?: () => number;
  }
): () => void {
  const job: MountJob = {
    id: opts.id,
    run: mount,
    kind: opts.kind,
    shouldRun: opts.shouldRun,
    distance: opts.distance,
  };
  insertJob(job);
  const cancel = () => {
    const at = mountQueue.findIndex((queued) => queued.run === mount);
    if (at !== -1) mountQueue.splice(at, 1);
  };
  if (opts.kind === "urgent") {
    cancelScheduledFlush();
    scheduleFlush();
    return cancel;
  }
  if (!flushing) scheduleFlush();
  return cancel;
}

/** Wheel / trackpad: do not start another TipTap until scrolling stops. */
export function notifyWorkspaceScroll() {
  scrollQuiet = false;
  cancelScheduledFlush();
  flushing = false;
  if (typeof window === "undefined") return;
  window.clearTimeout(scrollEndTimer);
  scrollEndTimer = window.setTimeout(() => {
    scrollQuiet = true;
    prefetchClosestVisible();
    if (mountQueue.length > 0) scheduleFlush();
  }, SCROLL_QUIET_MS);
}

/**
 * Jump-to-section / suggestion focus mounts this id ahead of the warmup
 * queue and resolves once that editor is in the document (or the wait
 * cap elapses). Callers should scroll after this promise — not before —
 * so Contents does not sweep through unloaded stubs.
 */
export function requestWorkspaceSectionMount(
  id: string,
  timeoutMs = JUMP_SCROLL_WAIT_MS
): Promise<void> {
  jumpTarget = id;
  dropPrefetchJobs();
  if (typeof window !== "undefined") {
    window.clearTimeout(jumpTimer);
    jumpTimer = window.setTimeout(() => {
      if (jumpTarget === id) jumpTarget = null;
      prefetchClosestVisible();
    }, timeoutMs);
  }
  for (const listener of sectionMountListeners) listener(id);
  return whenWorkspaceSectionReady(id, timeoutMs);
}

/** After chat/documents have painted, later editors may prefetch and warm. */
export function setLazyWorkspaceBackgroundMounts(enabled: boolean) {
  allowBackgroundMounts = enabled;
}

/** After the first section paints, queue every remaining editor in document order. */
export function warmupAllLazyWorkspaceSections() {
  for (const listener of sectionWarmupListeners) listener();
}

export function resetLazyWorkspaceMountQueue() {
  if (typeof window !== "undefined") {
    window.clearTimeout(jumpTimer);
    window.clearTimeout(scrollEndTimer);
  }
  jumpTimer = 0;
  scrollEndTimer = 0;
  jumpTarget = null;
  scrollQuiet = true;
  inFlight = false;
  allowBackgroundMounts = false;
  cancelScheduledFlush();
  mountQueue.length = 0;
  flushing = false;
  mountedSectionIds.clear();
  for (const waiters of readyWaiters.values()) {
    for (const waiter of waiters) waiter();
  }
  readyWaiters.clear();
}

/**
 * Defer TipTap until after first paint. Jumps and fast scrolls mount only the
 * section that was landed on; the rest warm in the background on idle.
 */
export function LazyWorkspaceSection({
  id,
  title,
  eager = false,
  style,
  onMounted,
  children,
}: {
  id: string;
  title: string;
  eager?: boolean;
  style?: CSSProperties;
  onMounted?: (id: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);
  const reportedMount = useRef(false);

  useEffect(() => {
    if (!mounted || reportedMount.current) return;
    reportedMount.current = true;
    markSectionMounted(id);
    onMounted?.(id);
  }, [mounted, id, onMounted]);

  useEffect(() => {
    if (mounted) return;

    let cancelMount: (() => void) | undefined;
    const commit = (kind: MountKind) => {
      mountedRef.current = true;
      if (kind === "urgent") setMounted(true);
      else startTransition(() => setMounted(true));
    };
    const queueMount = (kind: MountKind) => {
      if (mountedRef.current) return;
      cancelMount?.();
      const node = ref.current;
      cancelMount = enqueueLazyWorkspaceMount(
        () => {
          commit(kind);
        },
        {
          id,
          kind,
          shouldRun:
            kind === "prefetch" ? () => isNearViewport(node) : undefined,
          distance:
            kind === "prefetch" ? () => distanceToViewportTop(node) : undefined,
        }
      );
    };

    const onRequest = (requested: string) => {
      if (requested !== id) return;
      queueMount("urgent");
    };
    const onWarmup = () => {
      queueMount("warmup");
    };
    const onPrefetch = () => {
      if (
        !allowBackgroundMounts ||
        jumpTarget ||
        mountedRef.current ||
        !scrollQuiet
      ) {
        return;
      }
      queueMount("prefetch");
    };
    const candidate = {
      id,
      mounted: () => mountedRef.current,
      queue: onPrefetch,
      distance: () => distanceToViewportTop(ref.current),
      isNear: () => isNearViewport(ref.current),
    };
    sectionMountListeners.add(onRequest);
    sectionWarmupListeners.add(onWarmup);
    prefetchCandidates.add(candidate);

    if (eager) {
      queueMount("urgent");
    }

    return () => {
      sectionMountListeners.delete(onRequest);
      sectionWarmupListeners.delete(onWarmup);
      prefetchCandidates.delete(candidate);
      cancelMount?.();
    };
  }, [eager, mounted, id]);

  return (
    <section ref={ref} id={id} style={style} className="min-h-32">
      {mounted ? (
        children
      ) : (
        <h2 className="text-xl font-semibold">{title}</h2>
      )}
    </section>
  );
}
