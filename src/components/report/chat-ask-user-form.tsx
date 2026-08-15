"use client";

import { useState } from "react";
import { CircleHelp, Send } from "lucide-react";

export type AskUserQuestionInput = {
  question: string;
  hint?: string;
};

/**
 * Structured answer form rendered when the assistant calls the ask_user tool.
 * Interactive only on the newest assistant turn; earlier turns show the
 * questions as a static list. Blank answers are sent as explicit skips so the
 * model uses bracketed placeholders instead of inventing facts.
 */
export function AskUserForm({
  questions,
  disabled,
  onSubmit,
}: {
  questions: AskUserQuestionInput[];
  disabled: boolean;
  onSubmit: (message: string) => void;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [submitted, setSubmitted] = useState(false);

  const inactive = disabled || submitted;
  const answeredCount = answers.filter((a) => a.trim().length > 0).length;

  const submit = () => {
    if (inactive) return;
    setSubmitted(true);
    onSubmit(formatAnswersMessage(questions, answers));
  };

  return (
    <div className="rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3 py-2.5 text-[12px]">
      <div className="mb-2 flex items-center gap-1.5 font-medium text-[var(--primary)]">
        <CircleHelp className="size-3.5" />
        The assistant needs {questions.length === 1 ? "one answer" : "a few answers"}
      </div>
      <div className="space-y-2.5">
        {questions.map((q, i) => (
          <div key={i} className="space-y-1">
            <label className="block leading-snug text-[var(--foreground)]">
              {questions.length > 1 ? `${i + 1}. ` : ""}
              {q.question}
            </label>
            {inactive ? null : (
              <input
                type="text"
                value={answers[i] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={q.hint ?? "Leave blank to skip"}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[12px] outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
              />
            )}
          </div>
        ))}
      </div>
      {inactive ? (
        <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
          {submitted ? "Answers sent." : "This form is no longer active."}
        </p>
      ) : (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--muted-foreground)]">
            Skipped questions become bracketed placeholders.
          </span>
          <button
            type="button"
            onClick={submit}
            className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
          >
            <Send className="size-3" />
            {answeredCount === 0 ? "Skip all" : "Send answers"}
          </button>
        </div>
      )}
    </div>
  );
}

function formatAnswersMessage(
  questions: AskUserQuestionInput[],
  answers: string[]
): string {
  const lines = questions.map((q, i) => {
    const answer = answers[i]?.trim();
    return `${i + 1}. ${q.question}\n   ${answer || "(skipped — use a placeholder)"}`;
  });
  return `Answers to your questions:\n${lines.join("\n")}`;
}
