"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2, Mic, Square } from "lucide-react";
import { voiceInputLanguageCodes } from "@/lib/customers";
import {
  readStoredVoiceLanguage,
  VOICE_LANGUAGE_AUTO,
  voiceInputLanguageLabel,
  writeStoredVoiceLanguage,
} from "@/lib/voice/languages";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BAR_BASES = [0.35, 0.7, 1, 0.55] as const;

function VoiceLevelBars({ level }: { level: number }) {
  return (
    <span
      className="flex h-4 items-end gap-[3px]"
      aria-hidden="true"
      data-testid="chat-voice-level"
    >
      {BAR_BASES.map((base, index) => {
        const height = 4 + Math.round((0.18 + level * base) * 12);
        return (
          <span
            key={index}
            className="w-[3px] rounded-full bg-[var(--muted-foreground)] transition-[height] duration-75"
            style={{ height }}
          />
        );
      })}
    </span>
  );
}

function VoiceLanguageMenu({
  targetingAnalytics,
}: {
  targetingAnalytics: boolean;
}) {
  const allowed = voiceInputLanguageCodes();
  const [selected, setSelected] = useState(() =>
    readStoredVoiceLanguage(allowed)
  );
  const options =
    allowed.length > 1 ? [VOICE_LANGUAGE_AUTO, ...allowed] : [...allowed];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Voice input language"
          title={voiceInputLanguageLabel(selected)}
          data-testid={
            targetingAnalytics
              ? "analytics-chat-voice-language"
              : "chat-voice-language"
          }
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
        >
          <ChevronDown className="size-3" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-[9.5rem]">
        {options.map((code) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => {
              setSelected(code);
              writeStoredVoiceLanguage(code);
            }}
          >
            <Check
              className={cn(
                "size-3.5",
                selected === code ? "opacity-100" : "opacity-0"
              )}
              aria-hidden="true"
            />
            {voiceInputLanguageLabel(code)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const micTestId = targetingAnalytics
    ? "analytics-chat-voice-input"
    : "chat-voice-input";

  if (!live) {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label="Start voice input"
        title="Start voice input"
        aria-pressed={false}
        data-testid={micTestId}
        onClick={onToggle}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] disabled:opacity-40"
      >
        <Mic className="size-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <span
      className="flex items-center gap-1.5"
      data-testid={
        targetingAnalytics
          ? "analytics-chat-voice-recording"
          : "chat-voice-recording"
      }
    >
      <VoiceLevelBars level={level} />
      <VoiceLanguageMenu targetingAnalytics={targetingAnalytics} />
      <button
        type="button"
        aria-label="Stop voice input"
        title="Stop voice input"
        aria-pressed={true}
        data-testid={micTestId}
        onClick={onToggle}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[var(--foreground)] shadow-sm ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--secondary)]"
      >
        {requesting ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Square className="size-2.5 fill-current" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
