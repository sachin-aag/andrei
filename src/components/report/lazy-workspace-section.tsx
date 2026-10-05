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
 * Defer TipTap until the section is near the viewport. ELR mounts ~25
 * section editors on first paint; that work runs after `edit?_rsc=` returns
 * and leaves the tab on "Loading report…" until Chrome says unresponsive.
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
  const [mounted, setMounted] = useState(eager);

  useEffect(() => {
    if (mounted) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        startTransition(() => setMounted(true));
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  return (
    <section ref={ref} id={id} style={style} className="min-h-32">
      {mounted ? children : null}
    </section>
  );
}
