"use client";

import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { QuestionItem } from "./question-item";
import type { GeneratedQuestion } from "@/lib/ai/generate-guided-questions";
import { CRITERIA_BY_SECTION } from "@/lib/ai/criteria";
import { EDITABLE_SECTIONS } from "@/types/sections";

type EditableSection = (typeof EDITABLE_SECTIONS)[number];

type Answers = Record<string, string | null | undefined>;

type GuidedFlowSectionProps = {
  section: EditableSection;
  sectionLabel: string;
  questions: GeneratedQuestion[];
  answers: Answers;
  onAnswer: (questionId: string, value: string) => void;
  onDefer: (questionId: string) => void;
  disabled?: boolean;
};

function criterionStatus(
  criterionKey: string,
  questions: GeneratedQuestion[],
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
          <ul className="flex flex-col gap-2.5">
            {criteria.map((criterion) => {
              const status = criterionStatus(criterion.key, sectionQuestions, answers);
              return (
                <li key={criterion.key} className="flex items-start gap-2">
                  {status === "met" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                  ) : status === "deferred" ? (
                    <MinusCircle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                  ) : status === "not-covered" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500/60" />
                  ) : (
                    <Circle className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]/40" />
                  )}
                  <span
                    className={`text-xs leading-snug ${
                      status === "met" || status === "not-covered"
                        ? "text-[var(--muted-foreground)]"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {criterion.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
