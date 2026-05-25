import { describe, expect, it } from "vitest";
import type { SectionType } from "@/db/schema";
import {
  aggregateCriterionBySection,
  aggregateCriterionOverall,
  aggregateSectionOverall,
  dedupeReasoningsNonMet,
  emptyCriterionStatusCounts,
  escapeHtml,
  normalizeReasoningKey,
  reasoningPatternsFromDedupeOnly,
  type BulkEvalRow,
} from "@/lib/eval/bulk-eval-aggregates";

const baseRow = (overrides: Partial<BulkEvalRow>): BulkEvalRow => ({
  sourceFile: "x.docx",
  deviationNo: "DEV-1",
  section: "define",
  criterionKey: "define.what_happened",
  criterionLabel: "Clearly define what happened actually",
  status: "met",
  reasoning: "ok",
  ...overrides,
});

describe("bulk-eval-aggregates", () => {
  it("escapeHtml escapes special characters", () => {
    expect(escapeHtml(`a & b <tag> "q"`)).toBe("a &amp; b &lt;tag&gt; &quot;q&quot;");
  });

  it("normalizeReasoningKey collapses whitespace and lowercases", () => {
    expect(normalizeReasoningKey("  Foo   Bar  ")).toBe("foo bar");
  });

  it("emptyCriterionStatusCounts has zeroed fields", () => {
    const e = emptyCriterionStatusCounts();
    expect(e.met + e.partially_met + e.not_met + e.not_evaluated).toBe(0);
  });

  it("aggregateSectionOverall sums statuses per DMAIC section", () => {
    const rows = [
      baseRow({ section: "define", status: "met" }),
      baseRow({ section: "define", status: "met" }),
      baseRow({ section: "measure", status: "not_met" }),
      baseRow({
        section: "analyze",
        criterionKey: "analyze.sixm_completeness",
        status: "partially_met",
        reasoning: "x",
      }),
    ];
    const m = aggregateSectionOverall(rows);
    expect(m.get("define")?.met).toBe(2);
    expect(m.get("measure")?.not_met).toBe(1);
    expect(m.get("analyze")?.partially_met).toBe(1);
    expect(m.get("improve")?.met).toBe(0);
  });

  it("aggregateCriterionOverall sums statuses per criterion", () => {
    const rows = [
      baseRow({ criterionKey: "a", status: "met" }),
      baseRow({ criterionKey: "a", status: "not_met" }),
      baseRow({ criterionKey: "b", status: "partially_met" }),
    ];
    const m = aggregateCriterionOverall(rows);
    expect(m.get("a")).toEqual({
      met: 1,
      partially_met: 0,
      not_met: 1,
      not_evaluated: 0,
    });
    expect(m.get("b")?.partially_met).toBe(1);
  });

  it("aggregateCriterionBySection nests section maps", () => {
    const rows = [
      baseRow({
        criterionKey: "define.what_happened",
        section: "define",
        status: "met",
      }),
      baseRow({
        criterionKey: "define.what_happened",
        section: "measure",
        status: "not_met",
      }),
    ];
    const m = aggregateCriterionBySection(rows);
    expect(m.get("define.what_happened")?.get("define")?.met).toBe(1);
    expect(m.get("define.what_happened")?.get("measure")?.not_met).toBe(1);
  });

  it("dedupeReasoningsNonMet skips met statuses", () => {
    const items = dedupeReasoningsNonMet([
      baseRow({ status: "not_met", reasoning: "Same text" }),
      baseRow({
        criterionKey: "define.location",
        status: "not_met",
        reasoning: "same text ",
      }),
      baseRow({ status: "met", reasoning: "ignored" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].weight).toBe(2);
  });

  it("reasoningPatternsFromDedupeOnly sorts by occurrences", () => {
    const p = reasoningPatternsFromDedupeOnly([
      {
        id: 0,
        representativeText: "b",
        weight: 2,
        criterionWeights: { a: 2 },
        sectionWeights: { define: 2 } as Record<SectionType, number>,
      },
      {
        id: 1,
        representativeText: "a",
        weight: 5,
        criterionWeights: { b: 5 },
        sectionWeights: { measure: 5 } as Record<SectionType, number>,
      },
    ]);
    expect(p[0].occurrences).toBe(5);
  });
});
