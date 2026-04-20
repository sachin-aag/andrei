"use client";

import { Check, CircleAlert, Loader2 } from "lucide-react";
import type { SaveStatus as SaveStatusType } from "@/hooks/use-auto-save";

export function SaveStatus({
  status,
  lastSavedAt,
}: {
  status: SaveStatusType;
  lastSavedAt: Date | null;
}) {
  if (status === "saving") {
    return (
      <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="text-xs text-red-400 flex items-center gap-1.5">
        <CircleAlert className="size-3" /> Save error
      </div>
    );
  }
  if (status === "saved") {
    return (
      <div className="text-xs text-green-400 flex items-center gap-1.5">
        <Check className="size-3" /> Saved
        {lastSavedAt
          ? ` · ${lastSavedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : ""}
      </div>
    );
  }
  return (
    <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5">
      <Check className="size-3" /> Up to date
    </div>
  );
}
