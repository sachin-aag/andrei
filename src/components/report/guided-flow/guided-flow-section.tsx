"use client";

import { CheckCircle2, CircleDashed, MinusCircle } from "lucide-react";
import { QuestionItem } from "./question-item";
import type { NextQuestion } from "@/lib/ai/generate-next-question";
import { CRITERIA_BY_SECTION } from "@/lib/ai/criteria";
import { EDITABLE_SECTIONS } from "@/types/sections";

type EditableSection = (typeof EDITABLE_SECTIONS)[number];

type Answers = Record<string, string | null | undefined>;

type GuidedFlowSectionProps = {
  section: EditableSection;
  sectionLabel: string;
  questions: NextQuestion[];
  answers: Answers;
  onAnswer: (questionId: string, value: string) => void;
  onDefer: (questionId: string) => void;
  disabled?: boolean;
};

function criterionStatus(
  criterionKey: string,
  questions: NextQuestion[],
  answers: Answers
): "met" | "deferred" | "unanswered" | "not-covered" {
  const linked = questions.filter((q) => q.criteriaKeys.includes(criterionKey));
  if (linked.length === 0) return "not-covered";
  const hasDeferred = linked.some((q) => answers[q.id] === null);
  const allAnswered = linked.every(
    (q) => answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== ""
  );
  if (allAnswered) return "met";
  if (hasDeferred) return "deferred";
  return "unanswered";
}

export function GuidedFlowSection({
  section,
  sectionLabel,
  questions,
  answers,
  onAnswer,
  onDefer,
  disabled,
}: GuidedFlowSectionProps) {
  const criteria = CRITERIA_BY_SECTION[section] ?? [];
  const sectionQuestions = questions.filter((q) => q.section === section);

  return (
    <div className="flex gap-6">
      {/* Questions — left column */}
      <div className="min-w-0 flex-1">
        <h2 className="mb-4 text-base font-semibold text-[var(--foreground)]">
          {sectionLabel}
        </h2>

        {sectionQuestions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            No questions needed — this section looks complete based on existing content.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sectionQuestions.map((q) => (
              <QuestionItem
                key={q.id}
                question={q}
                answer={answers[q.id]}
                onAnswer={(value) => onAnswer(q.id, value)}
                onDefer={() => onDefer(q.id)}
                disabled={disabled}
              />
            ))}
          </div>
        )}
      </div>

      {/* Criteria panel — right column */}
      <div className="hidden w-64 shrink-0 xl:block">
        <div className="sticky top-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {sectionLabel} Criteria
          </p>
          <ul className="flex flex-col gap-2">
            {criteria.map((criterion) => {
              const status = criterionStatus(criterion.key, sectionQuestions, answers);
              return (
                <li key={criterion.key} className="flex items-start gap-2">
                  {status === "met" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                  ) : status === "deferred" ? (
                    <MinusCircle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                  ) : status === "not-covered" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]/40" />
                  ) : (
                    <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]/50" />
                  )}
                  <span
                    className={`text-xs leading-snug ${
                      status === "met"
                        ? "font-medium text-emerald-700 dark:text-emerald-400"
                        : status === "deferred"
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-[var(--muted-foreground)]"
                    }`}
                  >
                    {criterion.label}
                  </span>
                </li>
              );
            })}
          </ul>
          {/* Legend */}
          <div className="mt-4 flex flex-col gap-1 border-t border-[var(--border)] pt-3">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
              <span className="text-[10px] text-[var(--muted-foreground)]">Answered</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CircleDashed className="size-3 shrink-0 text-[var(--muted-foreground)]/50" />
              <span className="text-[10px] text-[var(--muted-foreground)]">Needs answer</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MinusCircle className="size-3 shrink-0 text-amber-400" />
              <span className="text-[10px] text-[var(--muted-foreground)]">Deferred (placeholder)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3 shrink-0 text-[var(--muted-foreground)]/40" />
              <span className="text-[10px] text-[var(--muted-foreground)]">Already covered</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
