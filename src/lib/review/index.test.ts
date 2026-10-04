import { describe, expect, it } from "vitest";
import * as review from "@/lib/review";
import { reviewRunWaves } from "@/lib/review/ui";

describe("review client barrel", () => {
  it("exports labels without pulling server runners", () => {
    expect(review.REVIEW_CATEGORIES).toContain("report");
    expect(review.categoryLabel("fda")).toBe("FDA");
    expect(review.reviewRunWaves).toBeTypeOf("function");
    expect(review).not.toHaveProperty("runReviewChecks");
    expect(review).not.toHaveProperty("loadReviewRunContext");
    expect(review).not.toHaveProperty("buildReviewSnapshot");
  });
});

describe("reviewRunWaves", () => {
  const checks = [
    { id: "report.criteria.define", kind: "run", category: "report" as const },
    { id: "report.placeholders", kind: "live", category: "report" as const },
    { id: "fda.211_192_thorough", kind: "run", category: "fda" as const },
    { id: "citations.resolves", kind: "run", category: "citations" as const },
    { id: "writing.grammar", kind: "run", category: "writing" as const },
  ];

  it("splits Run all into one request per category that has a run check", () => {
    expect(reviewRunWaves(checks)).toEqual([
      { category: "report" },
      { category: "fda" },
      { category: "citations" },
      { category: "writing" },
    ]);
  });

  it("keeps an explicit category or check list as a single wave", () => {
    expect(reviewRunWaves(checks, { category: "fda" })).toEqual([
      { category: "fda" },
    ]);
    expect(
      reviewRunWaves(checks, { checkIds: ["writing.grammar"] })
    ).toEqual([{ checkIds: ["writing.grammar"] }]);
  });

  it("omits a category with no run-kind checks", () => {
    expect(
      reviewRunWaves([
        { id: "report.placeholders", kind: "live", category: "report" },
        { id: "writing.grammar", kind: "run", category: "writing" },
      ])
    ).toEqual([{ category: "writing" }]);
  });
});
