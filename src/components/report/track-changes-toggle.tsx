"use client";

import { useId } from "react";
import { PenLine } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Editing mode, so it lives with the other "how am I editing" controls in the
 * toolbar rather than among the header's workflow actions. Goes amber when on
 * so the mode is legible without a second indicator elsewhere.
 */
export function TrackChangesToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  const id = useId();

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-2.5 py-1 transition-colors",
        checked
          ? "border-amber-300 bg-amber-50"
          : "border-transparent hover:bg-[var(--secondary)]"
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        className={cn(
          "size-3.5",
          // Match the pill, so the mode reads as one amber object.
          checked &&
            "data-[state=checked]:border-amber-600 data-[state=checked]:bg-amber-600"
        )}
      />
      <Label
        htmlFor={id}
        className={cn(
          "flex items-center gap-1.5 cursor-pointer whitespace-nowrap normal-case tracking-normal",
          checked && "text-amber-900"
        )}
      >
        <PenLine className="size-3.5" aria-hidden="true" />
        Track changes
      </Label>
    </div>
  );
}
