"use client";

import { AlertTriangle } from "lucide-react";

type Props = {
  count: number;
  onClick: () => void;
};

export function OverflowSummaryCard({ count, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 rounded-md border border-amber-200/60 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>+{count} more issue{count === 1 ? "" : "s"}</span>
    </button>
  );
}
