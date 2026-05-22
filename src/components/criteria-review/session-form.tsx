"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AI_STATUS_LABEL,
  CRITERIA_EVALUATION_AGREEMENT_LABELS,
  CRITERIA_EVALUATION_AGREEMENTS,
  MIN_HUMAN_COMMENT_LENGTH,
  REASONING_AGREEMENT_LABELS,
  REASONING_AGREEMENTS,
  humanCommentRequired,
  type CriteriaEvaluationAgreement,
  type HumanSubAnswer,
  type ReasoningAgreement,
} from "@/lib/criteria-review/human-judgment";
import { resolveHumanReviewCriterionDisplay } from "@/lib/criteria-review/human-review-criteria";
import type {
  CriteriaReviewDatasetItem,
  CriteriaReviewReportSection,
} from "@/lib/criteria-review/report-data";
import { SECTION_LABELS } from "@/types/sections";
import { nativeSelectClassName } from "@/components/ui/native-select";
import { useCriteriaReviewReviewer } from "@/components/criteria-review/reviewer-provider";

const AUTOSAVE_DELAY_MS = 1500;

/** Native select values for corrected traffic-light status. */
function suggestedStatusSelectValue(
  status: HumanSubAnswer["suggestedStatus"]
): "" | "met" | "partially_met" | "not_met" {
  switch (status) {
    case "met":
    case "partially_met":
    case "not_met":
      return status;
    default:
      return "";
  }
}

type DraftAnswer = {
  section: CriteriaReviewReportSection["section"];
  criterionKey: string;
  criteriaEvaluationAgreement?: CriteriaEvaluationAgreement;
  reasoningAgreement?: ReasoningAgreement;
  comment?: string;
  suggestedStatus?: HumanSubAnswer["suggestedStatus"];
};

/** Light-theme-only pills; avoid `dark:` so OS dark mode does not wash out text on white cards. */
function statusTone(status: string): string {
  switch (status) {
    case "met":
      return "border border-emerald-200 bg-emerald-50 text-emerald-800";
    case "partially_met":
      return "border border-amber-300 bg-amber-100 text-amber-950";
    case "not_met":
      return "border border-red-200 bg-red-50 text-red-800";
    default:
      return "border border-zinc-200 bg-zinc-100 text-zinc-700";
  }
}

export function CriteriaReviewSessionForm({
  session,
  prevId,
  nextId,
}: {
  session: CriteriaReviewDatasetItem;
  prevId: string | null;
  nextId: string | null;
}) {
  const router = useRouter();
  const { selectedReviewer, selectedReviewerId } = useCriteriaReviewReviewer();
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [submitReportOpen, setSubmitReportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  const initialAnswersForReviewer = useCallback(
    (reviewerId: string): Record<string, DraftAnswer> => {
      const stored = session.metadata.humanReviews?.[reviewerId]?.answers ?? {};
      const answers: Record<string, DraftAnswer> = {};
      for (const section of session.input.sections) {
        for (const criterion of section.criteria) {
          const existing = stored[criterion.answerKey];
          answers[criterion.answerKey] = {
            section: section.section,
            criterionKey: criterion.criterionKey,
            criteriaEvaluationAgreement: existing?.criteriaEvaluationAgreement,
            reasoningAgreement: existing?.reasoningAgreement,
            comment: existing?.comment ?? "",
            suggestedStatus: existing?.suggestedStatus ?? null,
          };
        }
      }
      return answers;
    },
    [session]
  );

  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>(() =>
    initialAnswersForReviewer(selectedReviewerId)
  );
  const loadedAnswersForReviewer = useRef("");

  useEffect(() => {
    const loadKey = `${session.id}:${selectedReviewerId}`;
    if (loadedAnswersForReviewer.current === loadKey) return;
    loadedAnswersForReviewer.current = loadKey;
    setAnswers(initialAnswersForReviewer(selectedReviewerId));
    setError(null);
  }, [session.id, selectedReviewerId, initialAnswersForReviewer]);

  const activeSection = session.input.sections[activeSectionIndex] ?? null;

  const updateAnswer = useCallback(
    (answerKey: string, patch: Partial<DraftAnswer>) => {
      setAnswers((prev) => ({
        ...prev,
        [answerKey]: { ...prev[answerKey], ...patch } as DraftAnswer,
      }));
    },
    []
  );

  // --- Auto-save logic ---
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  const saveAnswers = useCallback(
    async (answersToSave: Record<string, DraftAnswer>, complete: boolean): Promise<boolean> => {
      if (savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        const payload = {
          reviewer: selectedReviewer,
          answers: Object.values(answersToSave).map((answer) => ({
            section: answer.section,
            criterionKey: answer.criterionKey,
            criteriaEvaluationAgreement:
              answer.criteriaEvaluationAgreement || undefined,
            reasoningAgreement: answer.reasoningAgreement || undefined,
            comment: answer.comment?.trim() || undefined,
            suggestedStatus: answer.suggestedStatus ?? undefined,
          })),
          complete,
        };

        const res = await fetch(
          `/api/criteria-review/sessions/${encodeURIComponent(session.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Save failed");
          return false;
        }
        setLastSaved(new Date());
        return true;
      } catch {
        setError("Save failed");
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [session.id, selectedReviewer]
  );

  // Debounced auto-save: fires AUTOSAVE_DELAY_MS after the last answer change
  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveAnswers(answers, false);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [answers, selectedReviewer, saveAnswers]);

  const submitReport = async () => {
    // Flush any pending autosave first
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const saved = await saveAnswers(answers, true);
    if (saved) {
      setSubmitReportOpen(false);
      router.refresh();
      router.push("/criteria-review");
    }
  };

  const isAnswerReviewed = (answer: DraftAnswer | undefined): boolean =>
    Boolean(answer?.criteriaEvaluationAgreement && answer.reasoningAgreement);

  const reviewedCount = Object.values(answers).filter(isAnswerReviewed).length;
  const totalCriteria = session.metadata.totalCriterionCount;
  const canCompleteReport = totalCriteria > 0 && reviewedCount === totalCriteria;

  const sectionReviewedCount = (section: CriteriaReviewReportSection) =>
    section.criteria.filter((c) => isAnswerReviewed(answers[c.answerKey])).length;

  const goToSection = (index: number) => {
    setActiveSectionIndex(index);
    mainScrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-[var(--border)] px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold truncate">{session.input.deviationNo}</h1>
                <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                  {reviewedCount}/{totalCriteria} reviewed
                </span>
                {saving ? (
                  <span className="shrink-0 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                    <Loader2 className="size-3 animate-spin" />
                    Saving…
                  </span>
                ) : lastSaved ? (
                  <span className="shrink-0 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                    <Check className="size-3" />
                    Saved
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] truncate">
                {session.input.sourceFile}
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right text-sm">
            <p className="text-xs text-[var(--muted-foreground)]">Signed in as</p>
            <p className="font-medium">
              {selectedReviewer.name}{" "}
              <span className="font-normal text-[var(--muted-foreground)]">
                ({selectedReviewer.employeeId})
              </span>
            </p>
          </div>
        </div>
      </header>

      <Dialog open={submitReportOpen} onOpenChange={setSubmitReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit report</DialogTitle>
            <DialogDescription>
              All {totalCriteria} criteria have been reviewed for this report. Submit this reviewer&apos;s report review?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSubmitReportOpen(false)}
            >
              Keep reviewing
            </Button>
            <Button type="button" disabled={saving} onClick={submitReport}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar: section-level navigation */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-[var(--border)] p-3">
          <div className="space-y-1">
            {session.input.sections.map((section, idx) => {
              const reviewed = sectionReviewedCount(section);
              const total = section.criteria.length;
              const allDone = reviewed === total;
              return (
                <button
                  key={section.section}
                  type="button"
                  onClick={() => goToSection(idx)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                    idx === activeSectionIndex
                      ? "bg-[var(--brand-700)] text-white"
                      : "text-[var(--foreground)] hover:bg-[var(--secondary)]"
                  )}
                >
                  <span className="font-medium">
                    {section.sectionIndex}. {SECTION_LABELS[section.section]}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums",
                      idx === activeSectionIndex
                        ? "bg-white/20 text-white"
                        : allDone
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
                    )}
                  >
                    {reviewed}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div ref={mainScrollRef} className="min-h-0 flex-1 overflow-y-auto p-6">
          {activeSection ? (
            <div className="space-y-6">
              {/* Section content + previous sections */}
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                  <h2 className="mb-3 text-sm font-semibold">
                    {SECTION_LABELS[activeSection.section]} — Section content
                  </h2>
                  <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--foreground)]">
                    {activeSection.sectionContent}
                  </pre>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                  <h2 className="mb-3 text-sm font-semibold">Previous sections</h2>
                  {activeSection.previousSections.length > 0 ? (
                    <details className="rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        {activeSection.previousSections.length} previous section{activeSection.previousSections.length !== 1 ? "s" : ""}
                      </summary>
                      <div className="mt-3 space-y-4">
                        {activeSection.previousSections.map((section) => (
                          <div key={section.section} className="space-y-1">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                              {SECTION_LABELS[section.section]}
                            </h3>
                            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">
                              {section.content}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      No previous sections for this part of the report.
                    </p>
                  )}
                </div>
              </div>

              {/* All criteria for this section */}
              <div className="space-y-4">
                {activeSection.criteria.map((criterion) => {
                  const answer = answers[criterion.answerKey];
                  if (!answer) return null;
                  const display = resolveHumanReviewCriterionDisplay(
                    criterion.criterionKey,
                    {
                      label: criterion.label,
                      description: criterion.description,
                    }
                  );
                  const reviewed = isAnswerReviewed(answer);
                  const needsComment =
                    reviewed &&
                    humanCommentRequired(
                      answer.criteriaEvaluationAgreement,
                      answer.reasoningAgreement
                    );
                  const needsSuggested = answer.criteriaEvaluationAgreement === "no";

                  return (
                    <div
                      key={criterion.answerKey}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
                    >
                      {/* Criterion header */}
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--secondary)] text-xs font-semibold tabular-nums">
                            {criterion.index}
                          </span>
                          <div>
                            <h3 className="text-sm font-semibold">{display.label}</h3>
                          </div>
                        </div>
                        {reviewed ? (
                          <span className="shrink-0 text-xs font-medium text-[var(--muted-foreground)]">
                            Reviewed
                          </span>
                        ) : null}
                      </div>

                      {display.description ? (
                        <p className="mb-4 text-sm leading-relaxed text-[var(--muted-foreground)]">
                          {display.description}
                        </p>
                      ) : null}

                      <div className="grid gap-4 xl:grid-cols-2">
                        {/* AI reasoning */}
                        <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 p-3">
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                            AI classification
                          </p>
                          <div className="mb-3">
                            <span
                              className={cn(
                                "rounded-md px-2 py-0.5 text-xs font-semibold",
                                statusTone(criterion.aiStatus)
                              )}
                            >
                              {AI_STATUS_LABEL[criterion.aiStatus]}
                            </span>
                          </div>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                            AI reasoning
                          </p>
                          <p className="text-sm leading-relaxed">
                            {criterion.aiReasoning}
                          </p>
                        </div>

                        {/* Human evaluation */}
                        <div className="space-y-4">
                          <fieldset className="space-y-2">
                            <legend className="text-xs font-medium">
                              Agree with evaluation?
                            </legend>
                            <div className="flex gap-2">
                              {CRITERIA_EVALUATION_AGREEMENTS.map((value) => (
                                <label
                                  key={value}
                                  className={cn(
                                    "relative flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors focus-within:ring-1 focus-within:ring-[var(--ring)]",
                                    answer.criteriaEvaluationAgreement === value
                                      ? "border-[var(--brand-600)] bg-[var(--brand-700)]/10"
                                      : "border-[var(--border)] hover:bg-[var(--secondary)]"
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name={`criteria-agreement-${criterion.answerKey}`}
                                    checked={
                                      answer.criteriaEvaluationAgreement === value
                                    }
                                    onChange={() =>
                                      updateAnswer(criterion.answerKey, {
                                        criteriaEvaluationAgreement: value,
                                        suggestedStatus:
                                          value === "no"
                                            ? answer.suggestedStatus
                                            : null,
                                      })
                                    }
                                    className="absolute inset-0 m-0 cursor-pointer opacity-0"
                                  />
                                  {CRITERIA_EVALUATION_AGREEMENT_LABELS[value]}
                                </label>
                              ))}
                            </div>
                          </fieldset>

                          <fieldset className="space-y-2">
                            <legend className="text-xs font-medium">
                              Agree with AI reasoning?
                            </legend>
                            <div className="flex gap-2">
                              {REASONING_AGREEMENTS.map((value) => (
                                <label
                                  key={value}
                                  className={cn(
                                    "relative flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors focus-within:ring-1 focus-within:ring-[var(--ring)]",
                                    answer.reasoningAgreement === value
                                      ? "border-[var(--brand-600)] bg-[var(--brand-700)]/10"
                                      : "border-[var(--border)] hover:bg-[var(--secondary)]"
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name={`reasoning-agreement-${criterion.answerKey}`}
                                    checked={answer.reasoningAgreement === value}
                                    onChange={() =>
                                      updateAnswer(criterion.answerKey, {
                                        reasoningAgreement: value,
                                      })
                                    }
                                    className="absolute inset-0 m-0 cursor-pointer opacity-0"
                                  />
                                  {REASONING_AGREEMENT_LABELS[value]}
                                </label>
                              ))}
                            </div>
                          </fieldset>

                          {needsSuggested ? (
                            <div className="space-y-1.5">
                              <Label
                                htmlFor={`suggested-status-${criterion.answerKey}`}
                                className="text-xs"
                              >
                                Correct traffic-light status
                              </Label>
                              <select
                                id={`suggested-status-${criterion.answerKey}`}
                                value={suggestedStatusSelectValue(answer.suggestedStatus)}
                                onChange={(e) =>
                                  updateAnswer(criterion.answerKey, {
                                    suggestedStatus: e.target.value
                                      ? (e.target.value as DraftAnswer["suggestedStatus"])
                                      : null,
                                  })
                                }
                                className={nativeSelectClassName}
                              >
                                <option value="">Select status</option>
                                <option value="met">Met</option>
                                <option value="partially_met">Partially met</option>
                                <option value="not_met">Not met</option>
                              </select>
                            </div>
                          ) : null}

                          {needsComment ? (
                            <div className="space-y-1.5">
                              <Label
                                htmlFor={`comment-${criterion.answerKey}`}
                                className="text-xs"
                              >
                                Comment (min {MIN_HUMAN_COMMENT_LENGTH} chars)
                              </Label>
                              <Textarea
                                id={`comment-${criterion.answerKey}`}
                                value={answer.comment ?? ""}
                                onChange={(e) =>
                                  updateAnswer(criterion.answerKey, {
                                    comment: e.target.value,
                                  })
                                }
                                rows={2}
                                className="resize-y text-sm"
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[var(--border)] px-6 py-3 flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-2">
          {prevId && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/criteria-review/${encodeURIComponent(prevId)}`}>
                Previous report
              </a>
            </Button>
          )}
          {nextId && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/criteria-review/${encodeURIComponent(nextId)}`}>
                Next report
              </a>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {activeSectionIndex > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToSection(activeSectionIndex - 1)}
              >
                Previous section
              </Button>
            ) : null}
            {activeSectionIndex < session.input.sections.length - 1 ? (
              <Button
                size="sm"
                onClick={() => goToSection(activeSectionIndex + 1)}
              >
                Next section
              </Button>
            ) : null}
          </div>
          {canCompleteReport ? (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => setSubmitReportOpen(true)}
            >
              Submit report
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
