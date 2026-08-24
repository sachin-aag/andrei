"use client";

import { useEffect } from "react";
import { Focus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function isFocusModeShortcut(event: KeyboardEvent): boolean {
  if (event.repeat || event.altKey || event.isComposing) return false;
  if (event.key !== "f" && event.key !== "F") return false;
  if (!event.shiftKey) return false;
  return event.metaKey || event.ctrlKey;
}

type FocusModeToggleProps = {
  enabled: boolean;
  onToggle: () => void;
};

export function FocusModeToggle({ enabled, onToggle }: FocusModeToggleProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isFocusModeShortcut(event)) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("[role='dialog']")
      ) {
        return;
      }
      event.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onToggle]);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={enabled ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={enabled}
            aria-keyshortcuts="Control+Shift+F Meta+Shift+F"
            onClick={onToggle}
            className="shrink-0"
          >
            <Focus className="size-4" aria-hidden="true" />
            Focus
            {enabled ? (
              <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                On
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Hide the comment margin so you have more room to write. Documents and
          the assistant stay available. Shortcut: Ctrl+Shift+F.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
