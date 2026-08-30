"use client";

import { Loader2, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

const BAR_COUNT = 5;

function VoiceLevelBars({ level }: { level: number }) {
  return (
    <span className="flex h-3.5 items-end justify-center gap-px" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, index) => {
        const peak = (index + 1) / BAR_COUNT;
        const active = level >= peak * 0.22;
        const height = 3 + Math.round((active ? 0.35 + level : 0.15) * 10);
        return (
          <span
            key={index}
            className="w-0.5 rounded-full bg-current transition-[height] duration-75"
            style={{ height }}
          />
        );
      })}
    </span>
  );
}

export function ChatVoiceButton({
  recording,
  requesting,
  level,
  disabled,
  targetingAnalytics,
  onToggle,
}: {
  recording: boolean;
  requesting: boolean;
  level: number;
  disabled: boolean;
  targetingAnalytics: boolean;
  onToggle: () => void;
}) {
  const live = recording || requesting;
  const label = live ? "Stop voice input" : "Start voice input";
  return (
    <button
      type="button"
      disabled={disabled && !live}
      aria-label={label}
      title={label}
      aria-pressed={live}
      data-testid={
        targetingAnalytics ? "analytics-chat-voice-input" : "chat-voice-input"
      }
      onClick={onToggle}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
        live
          ? "bg-[var(--brand-600)] text-white hover:opacity-90"
          : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] disabled:opacity-40"
      )}
    >
      {requesting ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : live ? (
        <VoiceLevelBars level={level} />
      ) : (
        <Mic className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
