"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  MinusCircle,
  Sparkles,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Input } from "@/components/ui/input";
import { CRITERIA_BY_SECTION } from "@/lib/ai/criteria";
import { EDITABLE_SECTIONS } from "@/types/sections";
import type { AnsweredRecord, NextQuestion, Methodology } from "@/lib/ai/generate-next-question";
import type { MethodologySuggestion } from "@/lib/ai/suggest-methodology";

type EditableSection = (typeof EDITABLE_SECTIONS)[number];

type Phase =
  | "loading"
  | "questioning"
  | "loading-methodology"
  | "methodology"
  | "all-done"
  | "generating"
  | "error";

const SECTION_LABELS: Record<EditableSection, string> = {
  define: "Define",
  measure: "Measure",
  analyze: "Analyze",
  improve: "Improve",
  control: "Control",
};

const METHODOLOGY_LABELS: Record<Methodology, string> = {
  "5-why": "5-Why Analysis",
  "6m": "6M Analysis",
  combined: "Combined 5-Why + 6M",
};

const METHODOLOGY_DESCRIPTIONS: Record<Methodology, string> = {
  "5-why":
    "Traces the causal chain by asking 'why' five times, arriving at the root cause through a sequence of fact-based answers.",
  "6m":
    "Examines six categories of potential causes: Man, Machine, Measurement, Material, Method, and Milieu (environment).",
  combined:
    "Uses both the 6M fishbone framework and the 5-Why causal chain for thorough coverage of complex deviations.",
};

function criterionStatus(
  criterionKey: string,
  answeredRecords: AnsweredRecord[]
): "met" | "deferred" | "unanswered" {
  const linked = answeredRecords.filter((r) =>
    r.criteriaKeys.includes(criterionKey)
  );
  if (linked.length === 0) return "unanswered";
  const hasDeferred = linked.some((r) => r.answer === null);
  const allAnswered = linked.every(
    (r) => r.answer !== null && r.answer !== undefined && r.answer !== ""
  );
  if (allAnswered) return "met";
  if (hasDeferred) return "deferred";
  return "unanswered";
}

export function GuidedFlowWizard({
  reportId,
  deviationNo,
}: {
  reportId: string;
  deviationNo: string;
}) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [currentSection, setCurrentSection] = useState<EditableSection>("define");
  const [answeredRecords, setAnsweredRecords] = useState<AnsweredRecord[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<NextQuestion | null>(null);
  const [currentInput, setCurrentInput] = useState("");
  const [methodology, setMethodology] = useState<MethodologySuggestion | null>(null);
  const [selectedMethodology, setSelectedMethodology] = useState<Methodology>("combined");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generating, startGenerating] = useTransition();

  // Scroll to bottom whenever the active question changes
  useEffect(() => {
    if (phase === "questioning" || phase === "methodology" || phase === "all-done") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [phase, currentQuestion]);

  async function fetchMethodology(answered: AnsweredRecord[]) {
    setPhase("loading-methodology");
    try {
      const res = await fetch(`/api/reports/${reportId}/guided-draft/methodology`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defineAnswers: answered.filter((r) => r.section === "define"),
          measureAnswers: answered.filter((r) => r.section === "measure"),
        }),
      });
      const data = (await res.json()) as MethodologySuggestion;
      setMethodology(data);
      setSelectedMethodology(data.methodology);
    } catch {
      // Non-fatal — default to combined
      setSelectedMethodology("combined");
    }
    setPhase("methodology");
  }

  async function fetchNext(
    section: EditableSection,
    answered: AnsweredRecord[],
    method: Methodology
  ) {
    setPhase("loading");
    try {
      const res = await fetch(`/api/reports/${reportId}/guided-draft/next-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentSection: section,
          answeredSoFar: answered.map((r) => ({
            section: r.section,
            criteriaKeys: r.criteriaKeys,
            label: r.label,
            answer: r.answer,
          })),
          methodology: section === "analyze" ? method : undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(body.error ?? "Failed to load question");
        setPhase("error");
        return;
      }

      const data = (await res.json()) as { done: boolean; question: NextQuestion | null };

      if (data.done) {
        await advanceSection(section, answered, method);
      } else {
        setCurrentSection(section);
        setCurrentQuestion(data.question);
        setCurrentInput("");
        setPhase("questioning");
      }
    } catch {
      setErrorMessage("Network error. Please try again.");
      setPhase("error");
    }
  }

  async function advanceSection(
    section: EditableSection,
    answered: AnsweredRecord[],
    method: Methodology
  ) {
    const nextIdx = EDITABLE_SECTIONS.indexOf(section) + 1;
    if (nextIdx >= EDITABLE_SECTIONS.length) {
      setCurrentSection(section);
      setPhase("all-done");
      return;
    }

    const nextSection = EDITABLE_SECTIONS[nextIdx]!;
    setCurrentSection(nextSection);

    if (nextSection === "analyze") {
      await fetchMethodology(answered);
    } else {
      await fetchNext(nextSection, answered, method);
    }
  }

  // Kick off on mount
  useEffect(() => {
    void fetchNext("define", [], "combined");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAnswer(answer: string | null) {
    if (!currentQuestion) return;
    const newRecord: AnsweredRecord = {
      section: currentSection,
      criteriaKeys: currentQuestion.criteriaKeys,
      label: currentQuestion.label,
      answer,
    };
    const updated = [...answeredRecords, newRecord];
    setAnsweredRecords(updated);
    setCurrentInput("");
    void fetchNext(currentSection, updated, selectedMethodology);
  }

  function handleSkipSection() {
    void advanceSection(currentSection, answeredRecords, selectedMethodology);
  }

  function handleGenerate() {
    startGenerating(async () => {
      const res = await fetch(`/api/reports/${reportId}/guided-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answeredQuestions: answeredRecords,
          methodology: selectedMethodology,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to generate draft");
        return;
      }

      toast.success("Draft generated by Andrei — review and refine below");
      router.push(`/reports/${reportId}/edit`);
      router.refresh();
    });
  }

  // --- Criteria panel for current section ---
  const sectionCriteria = CRITERIA_BY_SECTION[currentSection] ?? [];

  // --- Section progress indicator ---
  const sectionAnswerCount = (s: EditableSection) =>
    answeredRecords.filter((r) => r.section === s).length;

  // --- Past answers for current section ---
  const pastForSection = answeredRecords.filter((r) => r.section === currentSection);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-[var(--muted-foreground)]"
            onClick={() => router.push(`/reports/${reportId}/edit`)}
            disabled={generating}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          <div className="flex-1">
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {deviationNo}
            </span>
          </div>

          {/* Section progress */}
          <div className="hidden items-center gap-1 sm:flex">
            {EDITABLE_SECTIONS.map((s, i) => {
              const isActive = s === currentSection;
              const isDone =
                EDITABLE_SECTIONS.indexOf(currentSection) > i ||
                phase === "all-done";
              const count = sectionAnswerCount(s);
              return (
                <div key={s} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="size-3 text-[var(--muted-foreground)]/40" />
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-[var(--brand-600)] text-white"
                        : isDone && count > 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "text-[var(--muted-foreground)]"
                    }`}
                  >
                    {SECTION_LABELS[s]}
                    {isDone && count > 0 && !isActive && ` ✓`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-6 py-8">
        {/* Main conversation column */}
        <div className="min-w-0 flex-1">
          {/* Past Q&As for current section */}
          {pastForSection.length > 0 && (
            <div className="mb-6 flex flex-col gap-3">
              {pastForSection.map((r, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 opacity-60"
                >
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">
                    {r.label}
                  </p>
                  {r.answer === null ? (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]/70">
                      <Clock className="size-3" />
                      Deferred — placeholder will be inserted
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--foreground)]/70 line-clamp-3">
                      {r.answer || "(left blank)"}
                    </p>
                  )}
                </div>
              ))}
              <div className="border-t border-[var(--border)]" />
            </div>
          )}

          {/* Loading state */}
          {(phase === "loading" || phase === "loading-methodology") && (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 py-4">
              <Loader2 className="size-4 animate-spin text-[var(--brand-600)]" />
              <p className="text-sm text-[var(--muted-foreground)]">
                {phase === "loading-methodology"
                  ? "Analysing Define + Measure to recommend an investigation methodology…"
                  : pastForSection.length === 0
                    ? `Preparing ${SECTION_LABELS[currentSection]} questions…`
                    : "Thinking about what to ask next…"}
              </p>
            </div>
          )}

          {/* Error state */}
          {phase === "error" && (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 text-destructive" />
                <p className="text-sm text-destructive">{errorMessage}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setErrorMessage(null);
                  void fetchNext(currentSection, answeredRecords, selectedMethodology);
                }}
              >
                Try again
              </Button>
            </div>
          )}

          {/* Methodology recommendation */}
          {phase === "methodology" && (
            <div className="rounded-lg border border-[var(--brand-600)]/20 bg-[var(--card)] p-5">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="size-4 text-[var(--brand-600)]" />
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Investigation methodology for Analyze
                </p>
              </div>
              {methodology?.reasoning && (
                <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                  {methodology.reasoning}
                </p>
              )}
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                {(["5-why", "6m", "combined"] as Methodology[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMethodology(m)}
                    className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
                      selectedMethodology === m
                        ? "border-[var(--brand-600)] bg-[var(--brand-600)]/5"
                        : "border-[var(--border)] hover:border-[var(--brand-600)]/40"
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        selectedMethodology === m
                          ? "text-[var(--brand-600)]"
                          : "text-[var(--foreground)]"
                      }`}
                    >
                      {METHODOLOGY_LABELS[m]}
                      {m === methodology?.methodology && (
                        <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-[var(--muted-foreground)]">
                          recommended
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {METHODOLOGY_DESCRIPTIONS[m]}
                    </p>
                  </button>
                ))}
              </div>
              <Button
                className="gap-2"
                onClick={() =>
                  void fetchNext("analyze", answeredRecords, selectedMethodology)
                }
              >
                Start Analyze
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}

          {/* Current question */}
          {phase === "questioning" && currentQuestion && (
            <div className="rounded-lg border border-[var(--brand-600)]/30 bg-[var(--card)] p-5 shadow-sm">
              <p className="mb-1 text-sm font-semibold text-[var(--foreground)]">
                {currentQuestion.label}
              </p>
              {currentQuestion.description && (
                <p className="mb-3 text-xs text-[var(--muted-foreground)]">
                  {currentQuestion.description}
                </p>
              )}

              {/* Input */}
              <div className="mb-3">
                {currentQuestion.inputType === "textarea" ? (
                  <AutoResizeTextarea
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    placeholder="Type your answer…"
                    className="min-h-[80px] resize-none text-sm"
                    autoFocus
                  />
                ) : currentQuestion.inputType === "choice" &&
                  currentQuestion.options?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {currentQuestion.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setCurrentInput(opt)}
                        className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          currentInput === opt
                            ? "border-[var(--brand-600)] bg-[var(--brand-600)] text-white"
                            : "border-[var(--border)] hover:border-[var(--brand-600)]/50"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Input
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    placeholder="Type your answer…"
                    className="text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && currentInput.trim()) {
                        e.preventDefault();
                        handleAnswer(currentInput.trim());
                      }
                    }}
                  />
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-[var(--muted-foreground)]"
                  onClick={() => handleAnswer(null)}
                >
                  <Clock className="size-3" />
                  Answer later
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={
                    currentInput.trim() === "" &&
                    currentQuestion.inputType !== "choice"
                  }
                  onClick={() => {
                    if (currentInput.trim()) handleAnswer(currentInput.trim());
                  }}
                >
                  Continue
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* All sections done — ready to generate */}
          {phase === "all-done" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/20">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  All sections covered
                </p>
              </div>
              <p className="mb-4 text-sm text-emerald-700 dark:text-emerald-400">
                Andrei has enough information to draft all five DMAIC sections. Generating the report takes about 30–60 seconds.
              </p>
              <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {generating ? "Generating draft…" : "Generate Draft"}
              </Button>
            </div>
          )}

          {/* Skip section button — available mid-section for non-Define sections */}
          {phase === "questioning" && currentSection !== "define" && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-[var(--muted-foreground)]"
                onClick={handleSkipSection}
              >
                Skip remaining {SECTION_LABELS[currentSection]} questions
              </Button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Criteria sidebar */}
        <div className="hidden w-56 shrink-0 xl:block">
          <div className="sticky top-20 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              {SECTION_LABELS[currentSection]} Criteria
            </p>
            <ul className="flex flex-col gap-2">
              {sectionCriteria.map((criterion) => {
                const status = criterionStatus(criterion.key, answeredRecords);
                return (
                  <li key={criterion.key} className="flex items-start gap-2">
                    {status === "met" ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                    ) : status === "deferred" ? (
                      <MinusCircle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                    ) : (
                      <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]/40" />
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
            <div className="mt-4 flex flex-col gap-1 border-t border-[var(--border)] pt-3">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
                <span className="text-[10px] text-[var(--muted-foreground)]">Answered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MinusCircle className="size-3 shrink-0 text-amber-400" />
                <span className="text-[10px] text-[var(--muted-foreground)]">Deferred</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CircleDashed className="size-3 shrink-0 text-[var(--muted-foreground)]/40" />
                <span className="text-[10px] text-[var(--muted-foreground)]">Pending</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen generating overlay */}
      {generating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--background)]/80 backdrop-blur-sm">
          <Loader2 className="size-10 animate-spin text-[var(--brand-600)]" />
          <div className="text-center">
            <p className="text-lg font-semibold text-[var(--foreground)]">
              Andrei is writing your report…
            </p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Generating all five DMAIC sections — this takes about 30–60 seconds
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
