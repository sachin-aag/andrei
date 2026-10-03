import { describe, expect, it } from "vitest";
import * as review from "@/lib/review";

describe("review client barrel", () => {
  it("exports labels without pulling server runners", () => {
    expect(review.REVIEW_CATEGORIES).toContain("report");
    expect(review.categoryLabel("fda")).toBe("FDA");
    expect(review).not.toHaveProperty("runReviewChecks");
    expect(review).not.toHaveProperty("loadReviewRunContext");
    expect(review).not.toHaveProperty("buildReviewSnapshot");
  });
});
