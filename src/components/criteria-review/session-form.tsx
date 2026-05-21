"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  type HumanReviewer,
  type HumanSubAnswer,
  type ReasoningAgreement,
} from "@/lib/criteria-review/human-judgment";
import type {
  CriteriaReviewDatasetItem,
  CriteriaReviewReportSection,
} from "@/lib/langfuse/criteria-dataset";
import { SECTION_LABELS } from "@/types/sections";

const REVIEWER_STORAGE_KEY = "criteria-review:reviewer:v1";
const CREATE_REVIEWER_VALUE = "__create_reviewer__";

type DraftAnswer = {
  section: CriteriaReviewReportSection["section"];
  criterionKey: string;
  criteriaEvaluationAgreement?: CriteriaEvaluationAgreement;
  reasoningAgreement?: ReasoningAgreement;
  comment?: string;
  suggestedStatus?: HumanSubAnswer["suggestedStatus"];
};

function statusTone(status: string): string {
  switch (status) {
    case "met":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "partially_met":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "not_met":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400";
  }
}

function savedReviewerFromStorage(): HumanReviewer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REVIEWER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HumanReviewer>;
    const id = parsed.id?.trim();
    const name = parsed.name?.trim();
    const employeeId = parsed.employeeId?.trim();
    return id && name && employeeId ? { id, name, employeeId } : null;
  } catch {
    return null;
  }
}

function persistReviewer(reviewer: HumanReviewer) {
  try {
    window.localStorage.setItem(REVIEWER_STORAGE_KEY, JSON.stringify(reviewer));
  } catch {
    // localStorage can fail in private browsing; saving can continue without it.
  }
}

export function CriteriaReviewSessionForm({
  session,
  reviewers,
  prevId,
  nextId,
}: {
  session: CriteriaReviewDatasetItem;
  reviewers: HumanReviewer[];
  prevId: string | null;
  nextId: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [creatingReviewer, setCreatingReviewer] = useState(false);
  const [createReviewerOpen, setCreateReviewerOpen] = useState(false);
  const [submitReportOpen, setSubmitReportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstCriterion = session.input.sections[0]?.criteria[0];
  const [activeAnswerKey, setActiveAnswerKey] = useState(
    firstCriterion?.answerKey ?? ""
  );
  const [reviewerOptions, setReviewerOptions] =
    useState<HumanReviewer[]>(reviewers);
  const [selectedReviewerId, setSelectedReviewerId] = useState(() => {
    const saved = savedReviewerFromStorage();
    if (saved && reviewers.some((reviewer) => reviewer.id === saved.id)) {
      return saved.id;
    }
    return "";
  });
  const selectedReviewer = reviewerOptions.find(
    (reviewer) => reviewer.id === selectedReviewerId
  );
  const [newReviewer, setNewReviewer] = useState({ name: "", employeeId: "" });

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

  const active = (() => {
    for (const section of session.input.sections) {
      const criterion = section.criteria.find(
        (item) => item.answerKey === activeAnswerKey
      );
      if (criterion) return { section, criterion };
    }
    return null;
  })();

  const activeAnswer = active ? answers[active.criterion.answerKey] : undefined;
  const orderedAnswerKeys = session.input.sections.flatMap((section) =>
    section.criteria.map((criterion) => criterion.answerKey)
  );

  const updateAnswer = useCallback(
    (answerKey: string, patch: Partial<DraftAnswer>) => {
      setAnswers((prev) => ({
        ...prev,
        [answerKey]: { ...prev[answerKey], ...patch } as DraftAnswer,
      }));
    },
    []
  );

  const selectReviewer = (reviewerId: string) => {
    if (reviewerId === CREATE_REVIEWER_VALUE) {
      setCreateReviewerOpen(true);
      return;
    }
    const nextReviewer = reviewerOptions.find((reviewer) => reviewer.id === reviewerId);
    if (!nextReviewer) return;
    setSelectedReviewerId(reviewerId);
    setAnswers(initialAnswersForReviewer(reviewerId));
    persistReviewer(nextReviewer);
    setError(null);
  };

  const createReviewer = async () => {
    const name = newReviewer.name.trim();
    const employeeId = newReviewer.employeeId.trim();
    if (!name || !employeeId) {
      setError("Reviewer name and employee ID are required.");
      return;
    }
    setCreatingReviewer(true);
    setError(null);
    try {
      const res = await fetch("/api/criteria-review/reviewers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, employeeId }),
      });
      const data = (await res.json()) as {
        reviewer?: HumanReviewer;
        error?: string;
      };
      if (!res.ok || !data.reviewer) {
        setError(data.error ?? "Could not create reviewer.");
        return;
      }
      setReviewerOptions((prev) => {
        const withoutDuplicate = prev.filter((r) => r.id !== data.reviewer!.id);
        return [...withoutDuplicate, data.reviewer!].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      });
      setNewReviewer({ name: "", employeeId: "" });
      setSelectedReviewerId(data.reviewer.id);
      setAnswers(initialAnswersForReviewer(data.reviewer.id));
      persistReviewer(data.reviewer);
      setCreateReviewerOpen(false);
    } catch {
      setError("Could not create reviewer.");
    } finally {
      setCreatingReviewer(false);
    }
  };

  const save = async (complete: boolean): Promise<boolean> => {
    if (!selectedReviewer) {
      setError("Select a reviewer before saving.");
      return false;
    }
    if (!active || !activeAnswer) return false;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        reviewer: selectedReviewer,
        [complete ? "answers" : "answer"]: complete
          ? Object.values(answers).map((answer) => ({
              section: answer.section,
              criterionKey: answer.criterionKey,
              criteriaEvaluationAgreement:
                answer.criteriaEvaluationAgreement || undefined,
              reasoningAgreement: answer.reasoningAgreement || undefined,
              comment: answer.comment?.trim() || undefined,
              suggestedStatus: answer.suggestedStatus ?? undefined,
            }))
          : {
              section: activeAnswer.section,
              criterionKey: activeAnswer.criterionKey,
              criteriaEvaluationAgreement:
                activeAnswer.criteriaEvaluationAgreement || undefined,
              reasoningAgreement: activeAnswer.reasoningAgreement || undefined,
              comment: activeAnswer.comment?.trim() || undefined,
              suggestedStatus: activeAnswer.suggestedStatus ?? undefined,
            },
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
      router.refresh();
      return true;
    } catch {
      setError("Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const isAnswerReviewed = (answer: DraftAnswer | undefined): boolean =>
    Boolean(answer?.criteriaEvaluationAgreement && answer.reasoningAgreement);

  const nextUnreviewedAnswerKey = (): string | null => {
    if (orderedAnswerKeys.length === 0) return null;
    const activeIndex = Math.max(0, orderedAnswerKeys.indexOf(activeAnswerKey));
    for (let offset = 1; offset <= orderedAnswerKeys.length; offset += 1) {
      const key =
        orderedAnswerKeys[(activeIndex + offset) % orderedAnswerKeys.length];
      if (!isAnswerReviewed(answers[key])) return key;
    }
    return null;
  };

  const saveAndNext = async () => {
    const saved = await save(false);
    if (!saved) return;

    const nextKey = nextUnreviewedAnswerKey();
    if (nextKey) {
      setActiveAnswerKey(nextKey);
      return;
    }
    setSubmitReportOpen(true);
  };

  const submitReport = async () => {
    const saved = await save(true);
    if (saved) {
      setSubmitReportOpen(false);
      router.push("/criteria-review");
    }
  };

  const currentAnswerComplete = Boolean(
    activeAnswer?.criteriaEvaluationAgreement && activeAnswer.reasoningAgreement
  );
  const needsComment =
    activeAnswer &&
    currentAnswerComplete &&
    humanCommentRequired(
      activeAnswer.criteriaEvaluationAgreement,
      activeAnswer.reasoningAgreement
    );
  const needsSuggested = activeAnswer?.criteriaEvaluationAgreement === "no";
  const reviewedCount = Object.values(answers).filter(isAnswerReviewed).length;
  const totalCriteria = session.metadata.totalCriterionCount;
  const canCompleteReport = totalCriteria > 0 && reviewedCount === totalCriteria;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 space-y-4 border-b border-[var(--border)] px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">{session.input.deviationNo}</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {session.input.sourceFile}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {session.input.sections.length} sections ·{" "}
              {session.metadata.totalCriterionCount} criteria
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Reviewer</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Select the person completing this review, or create a reviewer from the dropdown.
            </p>
          </div>
          <Label htmlFor="reviewer-select">Reviewer</Label>
          <Select value={selectedReviewerId} onValueChange={selectReviewer}>
            <SelectTrigger id="reviewer-select" className="mt-2 max-w-xl bg-[var(--card)]">
              <SelectValue placeholder="Select reviewer" />
            </SelectTrigger>
            <SelectContent>
              {reviewerOptions.map((reviewer) => (
                <SelectItem key={reviewer.id} value={reviewer.id}>
                  {reviewer.name} ({reviewer.employeeId})
                </SelectItem>
              ))}
              <SelectItem value={CREATE_REVIEWER_VALUE}>
                Create reviewer...
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <Dialog open={createReviewerOpen} onOpenChange={setCreateReviewerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create reviewer</DialogTitle>
            <DialogDescription>
              Add the reviewer name and employee ID. The reviewer will be available in the dropdown.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-reviewer-name">Name</Label>
              <Input
                id="new-reviewer-name"
                value={newReviewer.name}
                onChange={(e) =>
                  setNewReviewer((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Reviewer name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-reviewer-employee-id">Employee ID</Label>
              <Input
                id="new-reviewer-employee-id"
                value={newReviewer.employeeId}
                onChange={(e) =>
                  setNewReviewer((prev) => ({
                    ...prev,
                    employeeId: e.target.value,
                  }))
                }
                placeholder="Employee ID"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateReviewerOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={creatingReviewer} onClick={createReviewer}>
              {creatingReviewer ? <Loader2 className="size-4 animate-spin" /> : null}
              Create reviewer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-[var(--border)] p-3">
          <div className="space-y-4">
            {session.input.sections.map((section) => (
              <div key={section.section} className="space-y-1">
                <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  {section.sectionIndex}. {SECTION_LABELS[section.section]}
                </h2>
                {section.criteria.map((criterion) => {
                  const answer = answers[criterion.answerKey];
                  const done = Boolean(
                    answer?.criteriaEvaluationAgreement && answer.reasoningAgreement
                  );
                  return (
                    <button
                      key={criterion.answerKey}
                      type="button"
                      onClick={() => setActiveAnswerKey(criterion.answerKey)}
                      className={cn(
                        "grid w-full grid-cols-[1.5rem_1fr] gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors",
                        criterion.answerKey === activeAnswerKey
                          ? "bg-[var(--brand-700)] text-white"
                          : "text-[var(--foreground)] hover:bg-[var(--secondary)]"
                      )}
                    >
                      <span className="font-medium tabular-nums">
                        {criterion.index}.
                      </span>
                      <span>
                        <span className="line-clamp-2">{criterion.label}</span>
                        {done ? (
                          <span className="mt-0.5 block opacity-70">Reviewed</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto p-6">
          {!selectedReviewer ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">
              Select or create a reviewer before saving evaluations.
            </div>
          ) : active && activeAnswer ? (
            <div className="space-y-6">
              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">Input</h2>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      Current section: {SECTION_LABELS[active.section.section]}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Current section
                    </p>
                    <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--foreground)]">
                      {active.section.sectionContent}
                    </pre>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                  <h2 className="mb-3 text-sm font-semibold">Prompt context</h2>
                  <div className="space-y-4">
                    <details className="rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        System prompt
                      </summary>
                      <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">
                        {active.section.systemPrompt}
                      </pre>
                    </details>
                    {active.section.previousSections.length > 0 ? (
                      <details className="rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                          Previous sections ({active.section.previousSections.length})
                        </summary>
                        <div className="mt-3 space-y-4">
                          {active.section.previousSections.map((section) => (
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
                      <p className="rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 p-3 text-sm text-[var(--muted-foreground)]">
                        No previous sections for this part of the report.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 p-4">
                  <h2 className="mb-3 text-sm font-semibold">AI evaluation</h2>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                        Criterion
                      </p>
                      <h3 className="mt-1 text-base font-semibold">
                        {active.criterion.label}
                      </h3>
                      <details className="mt-3 rounded-md border border-[var(--border)] bg-[var(--card)]/70 p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                          Criterion guidance
                        </summary>
                        <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
                          {active.criterion.description}
                        </p>
                      </details>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                        Traffic light
                      </p>
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                          statusTone(active.criterion.aiStatus)
                        )}
                      >
                        {AI_STATUS_LABEL[active.criterion.aiStatus]}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                        AI reasoning
                      </p>
                      <p className="mt-2 text-sm leading-relaxed">
                        {active.criterion.aiReasoning}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
                  <h2 className="text-sm font-semibold">Human evaluation</h2>
                  <div className="mt-4 space-y-5">
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">
                        Do you agree with criteria evaluation?
                      </legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {CRITERIA_EVALUATION_AGREEMENTS.map((value) => (
                          <label
                            key={value}
                            className={cn(
                              "flex cursor-pointer gap-2 rounded-md border border-[var(--border)] p-3 text-sm transition-colors",
                              activeAnswer.criteriaEvaluationAgreement === value
                                ? "border-[var(--brand-600)] bg-[var(--brand-700)]/10"
                                : "hover:bg-[var(--secondary)]"
                            )}
                          >
                            <input
                              type="radio"
                              name={`criteria-agreement-${active.criterion.answerKey}`}
                              checked={
                                activeAnswer.criteriaEvaluationAgreement === value
                              }
                              onChange={() =>
                                updateAnswer(active.criterion.answerKey, {
                                  criteriaEvaluationAgreement: value,
                                  suggestedStatus:
                                    value === "no"
                                      ? activeAnswer.suggestedStatus
                                      : null,
                                })
                              }
                              className="mt-1"
                            />
                            {CRITERIA_EVALUATION_AGREEMENT_LABELS[value]}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">
                        Do you agree with reasoning given by the AI?
                      </legend>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {REASONING_AGREEMENTS.map((value) => (
                          <label
                            key={value}
                            className={cn(
                              "flex cursor-pointer gap-2 rounded-md border border-[var(--border)] p-3 text-sm transition-colors",
                              activeAnswer.reasoningAgreement === value
                                ? "border-[var(--brand-600)] bg-[var(--brand-700)]/10"
                                : "hover:bg-[var(--secondary)]"
                            )}
                          >
                            <input
                              type="radio"
                              name={`reasoning-agreement-${active.criterion.answerKey}`}
                              checked={activeAnswer.reasoningAgreement === value}
                              onChange={() =>
                                updateAnswer(active.criterion.answerKey, {
                                  reasoningAgreement: value,
                                })
                              }
                              className="mt-1"
                            />
                            {REASONING_AGREEMENT_LABELS[value]}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {needsSuggested ? (
                      <div className="space-y-2">
                        <Label htmlFor="suggested-status">
                          Correct traffic-light status
                        </Label>
                        <Select
                          value={activeAnswer.suggestedStatus ?? ""}
                          onValueChange={(v) =>
                            updateAnswer(active.criterion.answerKey, {
                              suggestedStatus:
                                v as DraftAnswer["suggestedStatus"],
                            })
                          }
                        >
                          <SelectTrigger id="suggested-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="met">Met</SelectItem>
                            <SelectItem value="partially_met">
                              Partially met
                            </SelectItem>
                            <SelectItem value="not_met">Not met</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {needsComment ? (
                      <div className="space-y-2">
                        <Label htmlFor="comment">
                          Comment (required, min {MIN_HUMAN_COMMENT_LENGTH} characters)
                        </Label>
                        <Textarea
                          id="comment"
                          value={activeAnswer.comment ?? ""}
                          onChange={(e) =>
                            updateAnswer(active.criterion.answerKey, {
                              comment: e.target.value,
                            })
                          }
                          rows={4}
                          className="resize-y"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving || !selectedReviewer || !currentAnswerComplete}
            onClick={() => save(false)}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save criterion
          </Button>
          <Button
            size="sm"
            disabled={saving || !selectedReviewer || !currentAnswerComplete}
            onClick={saveAndNext}
          >
            Save and next
          </Button>
          {canCompleteReport ? (
            <Button
              size="sm"
              variant="outline"
              disabled={saving || !selectedReviewer}
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
