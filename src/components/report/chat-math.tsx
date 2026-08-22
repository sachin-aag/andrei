"use client";

import { useEffect, useReducer } from "react";
import { cn } from "@/lib/utils";
import { ensureMathliveSsr } from "@/lib/math/mathlive-ssr";
import { latexToDisplayMathml } from "@/lib/math/latex-to-mathml";

export function ChatMath({
  latex,
  display,
}: {
  latex: string;
  display: "inline" | "block";
}) {
  const html = latexToDisplayMathml(latex, display);
  const [, retryAfterMathliveLoad] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (html) return;
    let cancelled = false;
    void ensureMathliveSsr()
      .then(() => {
        if (!cancelled) retryAfterMathliveLoad();
      })
      .catch(() => {
        // Keep the LaTeX fallback when MathLive fails to load.
      });
    return () => {
      cancelled = true;
    };
  }, [html, latex, display, retryAfterMathliveLoad]);

  const Tag = display === "block" ? "div" : "span";

  if (!html) {
    return (
      <Tag
        className={cn(
          "font-mono text-[0.95em]",
          display === "block" && "my-2 overflow-x-auto"
        )}
      >
        {latex}
      </Tag>
    );
  }

  return (
    <Tag
      className={cn(
        "chat-math-rendered",
        display === "block" ? "my-2 block overflow-x-auto" : "inline"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
