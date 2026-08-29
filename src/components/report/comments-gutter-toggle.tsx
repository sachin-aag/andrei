"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Shows or hides the review margin (human comments + AI suggestion cards).
 * Inline suggestion ticks stay available when the gutter is off.
 */
export function CommentsGutterToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-[var(--foreground)] transition-colors",
          checked ? "bg-[var(--foreground)]" : "bg-[var(--card)]"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none block size-3 rounded-full transition-transform",
            checked
              ? "translate-x-[14px] bg-[var(--card)]"
              : "translate-x-0.5 bg-[var(--foreground)]"
          )}
        />
      </button>
      <Label
        id={`${id}-label`}
        htmlFor={id}
        className="cursor-pointer whitespace-nowrap text-xs font-medium normal-case tracking-normal text-[var(--foreground)]"
      >
        Comments
      </Label>
    </div>
  );
}
