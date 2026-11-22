"use client";

import { Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const TEMPLATE_READY_HINT = "Complete template with Word export.";

export function TemplateReadyBadge({
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
            aria-label="Complete template"
            data-testid="template-ready-badge"
            className={cn(
              "inline-flex size-4 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[color-mix(in_srgb,var(--success)_78%,var(--muted-foreground))]",
              className
            )}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Check className="size-2.5" aria-hidden="true" strokeWidth={2.5} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-left">
          {TEMPLATE_READY_HINT}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
