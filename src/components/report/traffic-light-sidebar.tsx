"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronRight, Check, X, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useReport } from "@/providers/report-provider";
import { cn } from "@/lib/utils";
import type { CriterionStatus, SectionType } from "@/db/schema";
import type { EvaluationRecord } from "@/types/report";
import { EVALUATABLE_SECTIONS, getCriteria } from "@/lib/ai/criteria";
import { SECTION_LABELS } from "@/types/sections";

const STATUS_COLORS: Record<CriterionStatus, string> = {
  met: "bg-green-500",
  partially_met: "bg-yellow-500",
  not_met: "bg-red-500",
  not_evaluated: "bg-[var(--muted-foreground)]/40",
};

export function TrafficLightSidebar({
  activeSection,
}: {
  activeSection: SectionType;
}) {
  const { evaluations, runEvaluation, isEvaluating } = useReport();
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set([activeSection])
  );

  const grouped = useMemo(() => {
    const map = new Map<SectionType, EvaluationRecord[]>();
    for (const section of EVALUATABLE_SECTIONS) {
      const defs = getCriteria(section);
      const existing = evaluations.filter((e) => e.section === section);
      const byKey = new Map(existing.map((e) => [e.criterionKey, e]));
      const ordered = defs.map((d) => {
        const hit = byKey.get(d.key);
        if (hit) return hit;
        return {
          id: `placeholder-${d.key}`,
          reportId: "",
          sectionId: "",
          section,
          criterionKey: d.key,
          criterionLabel: d.label,
          status: "not_evaluated" as CriterionStatus,
          reasoning: "",
          suggestedFix: "",
          fixApplied: false,
          bypassed: false,
          updatedAt: "",
        };
      });
      map.set(section, ordered);
    }
    return map;
  }, [evaluations]);

  return (
    <div className="p-4 space-y-3">
      {EVALUATABLE_SECTIONS.map((section) => {
        const rows = grouped.get(section) ?? [];
        const sectionStatus = aggregateStatus(rows);
        const isOpen = openSections.has(section) || section === activeSection;
        return (
          <div
            key={section}
            className={cn(
              "rounded-md border border-[var(--border)] bg-[var(--card)]",
              section === activeSection && "ring-1 ring-[var(--brand-500)]"
            )}
          >
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--secondary)] cursor-pointer"
              onClick={() =>
                setOpenSections((prev) => {
                  const next = new Set(prev);
                  if (next.has(section)) next.delete(section);
                  else next.add(section);
                  return next;
                })
              }
            >
              {isOpen ? (
                <ChevronDown className="size-3.5 shrink-0" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0" />
              )}
              <span className={cn("size-2.5 rounded-full shrink-0", STATUS_COLORS[sectionStatus])} />
              <span className="font-semibold text-sm flex-1">
                {SECTION_LABELS[section]}
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {countByStatus(rows)}
              </span>
            </button>

            {isOpen && (
              <div className="px-2 pb-2 space-y-1">
                {rows.map((row) => (
                  <CriterionRow key={row.criterionKey} evaluation={row} section={section} />
                ))}
                <div className="pt-2 px-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={isEvaluating}
                    onClick={() => runEvaluation(section)}
                  >
                    <Sparkles className="size-3" /> Re-evaluate {SECTION_LABELS[section]}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function aggregateStatus(rows: EvaluationRecord[]): CriterionStatus {
  const effective = rows.map((r) =>
    r.bypassed ? "met" : r.status
  ) as CriterionStatus[];
  if (effective.every((s) => s === "not_evaluated")) return "not_evaluated";
  if (effective.some((s) => s === "not_met")) return "not_met";
  if (effective.some((s) => s === "partially_met")) return "partially_met";
  return "met";
}

function countByStatus(rows: EvaluationRecord[]) {
  const counts = { met: 0, partially_met: 0, not_met: 0, not_evaluated: 0 };
  for (const r of rows) {
    const effective = r.bypassed ? "met" : r.status;
    counts[effective]++;
  }
  return `${counts.met}/${rows.length}`;
}

function CriterionRow({
  evaluation,
  section,
}: {
  evaluation: EvaluationRecord;
  section: SectionType;
}) {
  const { setEvaluations, sectionRows, replaceSection, sections, report, readOnly } =
    useReport();
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);

  const effectiveStatus: CriterionStatus = evaluation.bypassed
    ? "met"
    : evaluation.status;

  const applyFix = async () => {
    if (!evaluation.suggestedFix) return;
    setPending(true);
    try {
      // Append suggested fix to narrative / appropriate text field of the section content
      appendFixToSection(section, evaluation.suggestedFix);
      // Mark as applied
      const res = await fetch(
        `/api/reports/${report.id}/evaluations/${evaluation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fixApplied: true }),
        }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEvaluations((prev) =>
        prev.map((e) => (e.id === evaluation.id ? data.evaluation : e))
      );
      toast.success("Fix applied");
    } catch {
      toast.error("Failed to apply fix");
    } finally {
      setPending(false);
    }
  };

  const appendFixToSection = (section: SectionType, fixText: string) => {
    // Find narrative-like field depending on section
    const current = sections[section as keyof typeof sections];
    if (!current) return;
    const prefix =
      "\n\n[AI-suggested fix applied " +
      new Date().toLocaleDateString() +
      "]\n";
    const suffix = "\n[/AI-suggested fix]";
    switch (section) {
      case "define":
      case "measure":
      case "improve":
      case "control": {
        const withNarrative = current as { narrative: string };
        replaceSection(section as never, {
          ...(current as object),
          narrative:
            (withNarrative.narrative ?? "").trim() +
            prefix +
            fixText +
            suffix,
        } as never);
        break;
      }
      case "analyze": {
        const ana = current as { investigationOutcome: string };
        replaceSection("analyze", {
          ...(current as object),
          investigationOutcome:
            (ana.investigationOutcome ?? "").trim() +
            prefix +
            fixText +
            suffix,
        } as never);
        break;
      }
    }
  };

  const ignoreFix = async () => {
    setPending(true);
    try {
      const res = await fetch(
        `/api/reports/${report.id}/evaluations/${evaluation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bypassed: true }),
        }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEvaluations((prev) =>
        prev.map((e) => (e.id === evaluation.id ? data.evaluation : e))
      );
      toast.success("Criterion marked as overridden");
    } catch {
      toast.error("Failed");
    } finally {
      setPending(false);
    }
  };

  const canAct = !readOnly && !evaluation.fixApplied && !evaluation.bypassed;
  const showFix =
    evaluation.suggestedFix &&
    (effectiveStatus === "partially_met" || effectiveStatus === "not_met") &&
    !evaluation.fixApplied &&
    !evaluation.bypassed;

  return (
    <div className="rounded px-2 py-1.5 hover:bg-[var(--secondary)] text-xs">
      <button
        className="w-full text-left flex items-start gap-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          className={cn(
            "size-2 rounded-full mt-1.5 shrink-0",
            STATUS_COLORS[effectiveStatus]
          )}
        />
        <span
          className={cn(
            "flex-1 leading-snug",
            evaluation.bypassed && "line-through text-[var(--muted-foreground)]",
            evaluation.fixApplied && "text-green-300"
          )}
        >
          {evaluation.criterionLabel}
        </span>
      </button>

      {expanded && (
        <div className="ml-4 mt-2 space-y-2">
          {evaluation.reasoning && (
            <p className="text-[var(--muted-foreground)] leading-relaxed">
              {evaluation.reasoning}
            </p>
          )}
          {showFix && (
            <div className="rounded-md bg-[var(--brand-800)]/70 border border-[var(--brand-500)]/30 p-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[var(--brand-200)] font-semibold text-[11px] uppercase tracking-wide">
                <Sparkles className="size-3" /> Suggested fix
              </div>
              <p className="leading-relaxed text-[var(--foreground)]">
                {evaluation.suggestedFix}
              </p>
              {canAct && (
                <div className="flex gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="success"
                    onClick={applyFix}
                    disabled={pending}
                    className="h-7 text-xs"
                  >
                    <Check className="size-3" /> Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={ignoreFix}
                    disabled={pending}
                    className="h-7 text-xs"
                  >
                    <X className="size-3" /> Ignore
                  </Button>
                </div>
              )}
            </div>
          )}
          {evaluation.fixApplied && (
            <div className="text-green-400 text-[11px] flex items-center gap-1">
              <Check className="size-3" /> Fix applied · content was updated
            </div>
          )}
          {evaluation.bypassed && (
            <div className="text-[var(--muted-foreground)] text-[11px]">
              Criterion overridden by user.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
