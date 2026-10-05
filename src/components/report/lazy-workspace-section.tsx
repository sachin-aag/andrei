"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Defer TipTap until after first paint, then until the section is near the
 * viewport. ELR (~25) and QSR (~18) used to mount every section editor in the
 * same commit that applies `edit?_rsc=`. That work runs after the flight
 * returns 200 and leaves the tab on "Loading report…" — Chrome then cannot
 * even navigate home because the main thread is stuck.
 */
export function LazyWorkspaceSection({
  id,
  eager = false,
  style,
  children,
}: {
  id: string;
  eager?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;

    const mount = () => startTransition(() => setMounted(true));

    if (eager) {
      const frame = requestAnimationFrame(() => {
        mount();
      });
      return () => cancelAnimationFrame(frame);
    }

    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      mount();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        mount();
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager, mounted]);

  return (
    <section ref={ref} id={id} style={style} className="min-h-32">
      {mounted ? children : null}
    </section>
  );
}
