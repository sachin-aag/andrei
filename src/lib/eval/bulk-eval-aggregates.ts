import type { CriterionStatus, SectionType } from "@/db/schema";
import {
  EVALUATABLE_SECTIONS,
  type CriterionDefinition,
  getCriteria,
} from "@/lib/ai/criteria";

export type BulkEvalRow = {
  sourceFile: string;
  deviationNo: string;
  section: SectionType;
  criterionKey: string;
  criterionLabel: string;
  status: CriterionStatus;
  reasoning: string;
};

/** Ordered list of criterion keys matching product evaluation order. */
export function allEvaluatableCriterionEntries(): CriterionDefinition[] {
  const out: CriterionDefinition[] = [];
  for (const section of EVALUATABLE_SECTIONS) {
    out.push(...getCriteria(section));
  }
  return out;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Normalized bucket key for fuzzy-dedupe and fallback clustering. */
export function normalizeReasoningKey(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function emptyCriterionStatusCounts(): Record<CriterionStatus, number> {
  return {
    met: 0,
    partially_met: 0,
    not_met: 0,
    not_evaluated: 0,
  };
}

/** Overall traffic-light totals per DMAIC phase (evaluatable sections only). */
export function aggregateSectionOverall(
  rows: BulkEvalRow[]
): Map<SectionType, Record<CriterionStatus, number>> {
  const map = new Map<SectionType, Record<CriterionStatus, number>>();
  for (const sec of EVALUATABLE_SECTIONS) {
    map.set(sec, emptyCriterionStatusCounts());
  }
  for (const r of rows) {
    const rec = map.get(r.section);
    if (!rec) continue;
    rec[r.status] += 1;
  }
  return map;
}

/** Overall totals per criterion across all sampled reports. */
export function aggregateCriterionOverall(
  rows: BulkEvalRow[]
): Map<string, Record<CriterionStatus, number>> {
  const map = new Map<string, Record<CriterionStatus, number>>();
  for (const r of rows) {
    let rec = map.get(r.criterionKey);
    if (!rec) {
      rec = emptyCriterionStatusCounts();
      map.set(r.criterionKey, rec);
    }
    rec[r.status] += 1;
  }
  return map;
}

/** Per criterion × section status counts (only evaluatable sections appear in rows). */
export function aggregateCriterionBySection(rows: BulkEvalRow[]): Map<
  string,
  Map<SectionType, Record<CriterionStatus, number>>
> {
  const outer = new Map<
    string,
    Map<SectionType, Record<CriterionStatus, number>>
  >();
  for (const r of rows) {
    let bySec = outer.get(r.criterionKey);
    if (!bySec) {
      bySec = new Map();
      outer.set(r.criterionKey, bySec);
    }
    let cnt = bySec.get(r.section);
    if (!cnt) {
      cnt = emptyCriterionStatusCounts();
      bySec.set(r.section, cnt);
    }
    cnt[r.status] += 1;
  }
  return outer;
}

/** Dedupe non-met reasoning lines for clustering / fallback tables. */
export type DedupedReasonSample = {
  id: number;
  representativeText: string;
  weight: number;
  criterionWeights: Record<string, number>;
  sectionWeights: Record<SectionType, number>;
};

export function dedupeReasoningsNonMet(rows: BulkEvalRow[]): DedupedReasonSample[] {
  type Acc = {
    representativeText: string;
    weight: number;
    criterionWeights: Record<string, number>;
    sectionWeights: Record<string, number>;
  };
  const byKey = new Map<string, Acc>();
  for (const r of rows) {
    if (r.status === "met") continue;
    const key = normalizeReasoningKey(r.reasoning);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        representativeText: r.reasoning.trim(),
        weight: 1,
        criterionWeights: { [r.criterionKey]: 1 },
        sectionWeights: { [r.section]: 1 },
      });
    } else {
      existing.weight += 1;
      existing.criterionWeights[r.criterionKey] =
        (existing.criterionWeights[r.criterionKey] ?? 0) + 1;
      existing.sectionWeights[r.section] =
        (existing.sectionWeights[r.section] ?? 0) + 1;
      const t = r.reasoning.trim();
      if (
        t &&
        (!existing.representativeText || t.length < existing.representativeText.length)
      ) {
        existing.representativeText = t;
      }
    }
  }
  let id = 0;
  return [...byKey.values()].map((v) => ({
    id: id++,
    representativeText: v.representativeText,
    weight: v.weight,
    criterionWeights: v.criterionWeights,
    sectionWeights: v.sectionWeights as Record<SectionType, number>,
  }));
}

/** Fallback grouping when clustering LLM fails: one row per normalized key. */
export function reasoningPatternsFromDedupeOnly(
  items: DedupedReasonSample[]
): Array<{
  patternLabel: string;
  occurrences: number;
  topCriterionKeys: string[];
  exampleReasoning: string;
}> {
  return items
    .map((item) => {
      const tops = entriesSortedByValue(item.criterionWeights).slice(0, 3);
      return {
        patternLabel:
          truncateOneLine(item.representativeText, 90) ||
          `Pattern ${item.id + 1}`,
        occurrences: item.weight,
        topCriterionKeys: tops.map(([k]) => k),
        exampleReasoning: item.representativeText,
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences);
}

function entriesSortedByValue(o: Record<string, number>): [string, number][] {
  return Object.entries(o).sort(([, a], [, b]) => b - a);
}

export function truncateOneLine(text: string, maxLen: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= maxLen) return one;
  return `${one.slice(0, maxLen - 1)}…`;
}

export function criterionLabelLookup(): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of allEvaluatableCriterionEntries()) {
    m.set(c.key, c.label);
  }
  return m;
}
