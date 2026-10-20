import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { sectionEvaluationsAreFresh } from "@/lib/review/checks/report-criteria";
import type { EvaluationRecord } from "@/types/report";

function evaluation(
  overrides: Partial<EvaluationRecord> & Pick<EvaluationRecord, "criterionKey">
): EvaluationRecord {
  return {
    id: overrides.id ?? overrides.criterionKey,
    reportId: "r1",
    sectionId: "s1",
    section: "define",
    criterionLabel: "Problem",
    status: "met",
    reasoning: "ok",
    bypassed: false,
    evaluatedContentHash: "fresh",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sectionEvaluationsAreFresh", () => {
  it("is true only when every non-FDA criterion still matches the hash", () => {
    expect(
      sectionEvaluationsAreFresh({
        section: "define",
        criteria: [{ key: "define.problem" }, { key: "define.scope" }],
        evaluations: [
          evaluation({ criterionKey: "define.problem" }),
          evaluation({ criterionKey: "define.scope" }),
          evaluation({
            criterionKey: "fda.211_192_thorough",
            evaluatedContentHash: "stale",
          }),
        ],
        contentHash: "fresh",
      })
    ).toBe(true);
  });

  it("is false when a criterion is missing or stale", () => {
    expect(
      sectionEvaluationsAreFresh({
        section: "define",
        criteria: [{ key: "define.problem" }, { key: "define.scope" }],
        evaluations: [evaluation({ criterionKey: "define.problem" })],
        contentHash: "fresh",
      })
    ).toBe(false);
    expect(
      sectionEvaluationsAreFresh({
        section: "define",
        criteria: [{ key: "define.problem" }],
        evaluations: [
          evaluation({
            criterionKey: "define.problem",
            evaluatedContentHash: "old",
          }),
        ],
        contentHash: "fresh",
      })
    ).toBe(false);
  });
});
