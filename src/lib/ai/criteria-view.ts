import type { CriterionStatus, SectionType } from "@/db/schema";
import type { EvaluationRecord } from "@/types/report";
import { EVALUATABLE_SECTIONS, getCriteria } from "@/lib/ai/criteria";

export type CriterionRow = EvaluationRecord & {
  /** True when this row is just a placeholder for a criterion that has never been evaluated. */
  isPlaceholder: boolean;
};

export const STATUS_COLOR: Record<CriterionStatus, string> = {
  met: "bg-green-700",
  partially_met: "bg-yellow-700",
  not_met: "bg-red-700",
  not_evaluated: "bg-[var(--muted-foreground)]/40",
};

export const STATUS_TEXT_COLOR: Record<CriterionStatus, string> = {
  met: "text-green-700",
  partially_met: "text-yellow-700",
  not_met: "text-red-700",
  not_evaluated: "text-[var(--muted-foreground)]",
};

export function effectiveStatus(row: EvaluationRecord): CriterionStatus {
  return row.bypassed ? "met" : row.status;
}

/** Derive ordered rows for a section, merging definitions with stored evaluations. */
export function rowsForSection(
  section: SectionType,
  evaluations: EvaluationRecord[]
): CriterionRow[] {
  const defs = getCriteria(section);
  const byKey = new Map(
    evaluations.filter((e) => e.section === section).map((e) => [e.criterionKey, e])
  );
  return defs.map((d) => {
    const hit = byKey.get(d.key);
    if (hit) return { ...hit, isPlaceholder: false };
    return {
      id: `placeholder-${section}-${d.key}`,
      reportId: "",
      sectionId: "",
      section,
      criterionKey: d.key,
      criterionLabel: d.label,
      status: "not_evaluated" as CriterionStatus,
      reasoning: "",
      suggestedFix: { anchorText: "", replacementText: "" },
      fixApplied: false,
      bypassed: false,
      evaluatedContentHash: "",
      updatedAt: "",
      isPlaceholder: true,
    };
  });
}

export function rowsBySection(
  evaluations: EvaluationRecord[]
): Map<SectionType, CriterionRow[]> {
  const map = new Map<SectionType, CriterionRow[]>();
  for (const section of EVALUATABLE_SECTIONS) {
    map.set(section, rowsForSection(section, evaluations));
  }
  return map;
}

export function aggregateStatus(rows: EvaluationRecord[]): CriterionStatus {
  const effective = rows.map(effectiveStatus);
  if (effective.every((s) => s === "not_evaluated")) return "not_evaluated";
  if (effective.some((s) => s === "not_met")) return "not_met";
  if (effective.some((s) => s === "partially_met")) return "partially_met";
  return "met";
}

export function metCount(rows: EvaluationRecord[]): { met: number; total: number } {
  let met = 0;
  for (const r of rows) {
    if (effectiveStatus(r) === "met") met++;
  }
  return { met, total: rows.length };
}

/** Active suggestions = AI fixes that have an anchor or replacement, not yet applied or bypassed. */
export function activeSuggestions(
  evaluations: EvaluationRecord[]
): EvaluationRecord[] {
  return evaluations.filter(
    (e) =>
      !e.fixApplied &&
      !e.bypassed &&
      (e.status === "partially_met" || e.status === "not_met") &&
      !!e.suggestedFix?.replacementText?.trim()
  );
}
