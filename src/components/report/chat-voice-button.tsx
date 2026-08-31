"use client";

import { useEffect, useRef, useState } from "react";
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

const WAVE_BAR_COUNT = 18;
const WAVE_SAMPLE_MS = 80;
const WAVE_MIN_PX = 10;
const WAVE_MAX_PX = 44;

export const VOICE_RECORDING_HINT = "Transcript appears when you stop";
export const VOICE_TRANSCRIBING_HINT = "Transcribing…";

function VoiceLevelBars({ level }: { level: number }) {
  const latestRef = useRef(level);
  const [samples, setSamples] = useState(() =>
    Array.from({ length: WAVE_BAR_COUNT }, () => 0.12)
  );

  useEffect(() => {
    latestRef.current = level;
  }, [level]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const boosted = Math.min(1, 0.1 + latestRef.current * 2.8);
      setSamples((prev) => {
        const next = prev.slice(1);
        next.push(boosted);
        return next;
      });
    }, WAVE_SAMPLE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      className="flex h-11 items-end gap-[3px]"
      aria-hidden="true"
      data-testid="chat-voice-level"
    >
      {samples.map((sample, index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-[var(--brand-500)] transition-[height] duration-75"
          style={{
            height:
              WAVE_MIN_PX + Math.round(sample * (WAVE_MAX_PX - WAVE_MIN_PX)),
          }}
        />
      ))}
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
  transcribing,
  level,
  disabled,
  targetingAnalytics,
  onToggle,
}: {
  recording: boolean;
  requesting: boolean;
  transcribing: boolean;
  level: number;
  disabled: boolean;
  targetingAnalytics: boolean;
  onToggle: () => void;
}) {
  const live = recording || requesting;
  const micTestId = targetingAnalytics
    ? "analytics-chat-voice-input"
    : "chat-voice-input";
  const hintTestId = targetingAnalytics
    ? "analytics-chat-voice-hint"
    : "chat-voice-hint";

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
      className="flex items-center gap-2"
      data-testid={
        targetingAnalytics
          ? "analytics-chat-voice-recording"
          : "chat-voice-recording"
      }
    >
      <span className="flex min-w-0 flex-col items-end gap-0.5">
        <VoiceLevelBars level={level} />
        <span
          className="max-w-[9.5rem] text-right text-[11px] leading-snug text-[var(--muted-foreground)]"
          data-testid={hintTestId}
        >
          {transcribing ? VOICE_TRANSCRIBING_HINT : VOICE_RECORDING_HINT}
        </span>
      </span>
      <VoiceLanguageMenu targetingAnalytics={targetingAnalytics} />
      <button
        type="button"
        aria-label="Stop voice input"
        title="Stop voice input"
        aria-pressed={true}
        data-testid={micTestId}
        disabled={transcribing}
        onClick={onToggle}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[var(--foreground)] shadow-sm ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--secondary)] disabled:opacity-60"
      >
        {requesting || transcribing ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Square className="size-2.5 fill-current" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
