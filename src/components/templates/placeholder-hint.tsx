"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const PLACEHOLDER_WORD_EXPORT_HINT =
  "Placeholder. Word export is not this form yet.";

export function PlaceholderHint({
  className,
}: {
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label="Placeholder"
            data-testid="template-placeholder-hint"
            className={cn(
              "inline-flex size-5 items-center justify-center text-[var(--destructive)]",
              className
            )}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Info className="size-3.5" aria-hidden="true" strokeWidth={2.25} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-left">
          {PLACEHOLDER_WORD_EXPORT_HINT}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
