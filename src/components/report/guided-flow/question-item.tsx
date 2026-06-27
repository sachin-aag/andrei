"use client";

import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import type { NextQuestion } from "@/lib/ai/generate-next-question";

type QuestionItemProps = {
  question: NextQuestion;
  answer: string | null | undefined;
  onAnswer: (value: string) => void;
  onDefer: () => void;
  disabled?: boolean;
};

export function QuestionItem({
  question,
  answer,
  onAnswer,
  onDefer,
  disabled,
}: QuestionItemProps) {
  const isDeferred = answer === null;

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isDeferred
          ? "border-[var(--border)] bg-[var(--muted)]/30"
          : answer
            ? "border-[var(--border)] bg-[var(--card)]"
            : "border-[var(--border)] bg-[var(--card)]"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-[var(--foreground)]">
            {question.label}
          </p>
          {question.description && (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {question.description}
            </p>
          )}
        </div>
        {question.required && (
          <span className="shrink-0 rounded-full bg-[var(--brand-600)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--brand-600)]">
            Required
          </span>
        )}
      </div>

      {isDeferred ? (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2 text-xs text-[var(--muted-foreground)]">
            <Clock className="size-3 shrink-0" />
            Will be filled later — a placeholder will be inserted
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={() => onAnswer("")}
            disabled={disabled}
          >
            Answer now
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {question.inputType === "textarea" ? (
            <AutoResizeTextarea
              value={answer ?? ""}
              onChange={(e) => onAnswer(e.target.value)}
              placeholder="Type your answer…"
              className="min-h-[72px] resize-none text-sm"
              disabled={disabled}
            />
          ) : question.inputType === "choice" && question.options?.length ? (
            <div className="flex flex-wrap gap-2">
              {question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onAnswer(opt)}
                  disabled={disabled}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    answer === opt
                      ? "border-[var(--brand-600)] bg-[var(--brand-600)] text-white"
                      : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--brand-600)]/50"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <Input
              value={answer ?? ""}
              onChange={(e) => onAnswer(e.target.value)}
              placeholder="Type your answer…"
              className="text-sm"
              disabled={disabled}
            />
          )}

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              onClick={onDefer}
              disabled={disabled}
            >
              <Clock className="size-3" />
              Answer later
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
