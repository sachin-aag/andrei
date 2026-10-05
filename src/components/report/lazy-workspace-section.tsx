"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const mountQueue: Array<() => void> = [];
let flushing = false;
const sectionMountListeners = new Set<(id: string) => void>();

/**
 * One TipTap section per frame so 18 intersecting QSR shells cannot mount
 * together. Returns a cancel for sections that unmount while still queued.
 */
export function enqueueLazyWorkspaceMount(
  mount: () => void,
  urgent = false
): () => void {
  const existing = mountQueue.indexOf(mount);
  if (existing !== -1) mountQueue.splice(existing, 1);
  if (urgent) mountQueue.unshift(mount);
  else mountQueue.push(mount);
  const cancel = () => {
    const at = mountQueue.indexOf(mount);
    if (at !== -1) mountQueue.splice(at, 1);
  };
  if (flushing) return cancel;
  flushing = true;
  const flush = () => {
    const next = mountQueue.shift();
    try {
      next?.();
    } finally {
      // A throwing mount must not strand the sections queued behind it.
      if (mountQueue.length > 0) {
        requestAnimationFrame(flush);
      } else {
        flushing = false;
      }
    }
  };
  requestAnimationFrame(flush);
  return cancel;
}

/** Jump-to-section / suggestion focus mounts this id ahead of the viewport queue. */
export function requestWorkspaceSectionMount(id: string) {
  for (const listener of sectionMountListeners) listener(id);
}

export function resetLazyWorkspaceMountQueue() {
  mountQueue.length = 0;
  flushing = false;
}

/**
 * Defer TipTap until after first paint, then until the section is near the
 * viewport. ELR (~25) and QSR (~18) used to mount every section editor in the
 * same commit. The one-per-frame queue keeps a 160px prefetch from piling up.
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
  const reportedMount = useRef(false);

  useEffect(() => {
    if (!mounted || reportedMount.current) return;
    reportedMount.current = true;
    onMounted?.(id);
  }, [mounted, id, onMounted]);

  useEffect(() => {
    if (mounted) return;

    let cancelMount: (() => void) | undefined;
    const queueMount = (urgent = false) => {
      cancelMount?.();
      cancelMount = enqueueLazyWorkspaceMount(
        () => startTransition(() => setMounted(true)),
        urgent
      );
    };

    const onRequest = (requested: string) => {
      if (requested !== id) return;
      queueMount(true);
    };
    sectionMountListeners.add(onRequest);

    if (eager) {
      queueMount(false);
      return () => {
        sectionMountListeners.delete(onRequest);
        cancelMount?.();
      };
    }

    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      queueMount(false);
      return () => {
        sectionMountListeners.delete(onRequest);
        cancelMount?.();
      };
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        queueMount(false);
        io.disconnect();
      },
      { rootMargin: "160px 0px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      sectionMountListeners.delete(onRequest);
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
