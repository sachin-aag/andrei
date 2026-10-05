"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReportWorkspaceLoading({
  fullScreen = false,
}: {
  fullScreen?: boolean;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      className={cn(
        "flex items-center justify-center bg-[var(--background)]",
        fullScreen ? "h-screen" : "min-h-[50vh] flex-1"
      )}
    >
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <span
          className="inline-flex size-4 animate-spin"
          style={{ willChange: "transform" }}
          aria-hidden="true"
        >
          <Loader2 className="size-4" />
        </span>
        {slow
          ? "Still loading — a large report can take a bit…"
          : "Loading report…"}
      </div>
    </div>
  );
}
