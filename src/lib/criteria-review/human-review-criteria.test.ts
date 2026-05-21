import { describe, expect, it } from "vitest";
import {
  getHumanReviewCriterion,
  resolveHumanReviewCriterionDisplay,
} from "@/lib/criteria-review/human-review-criteria";

describe("human-review-criteria", () => {
  it("returns Untitled-2 copy for define keys", () => {
    const copy = getHumanReviewCriterion("define.what_happened");
    expect(copy?.label).toBe("Clearly define what happens actually.");
    expect(copy?.description).toBe(copy?.label);
  });

  it("uses short label for measure.facts_data with full description", () => {
    const copy = getHumanReviewCriterion("measure.facts_data");
    expect(copy?.label).toBe("Relevant facts and data reviewed");
    expect(copy?.description).toContain("controls limits");
  });

  it("falls back to stored session copy for analyze keys", () => {
    const stored = {
      label: "6M method completeness",
      description: "6M and 5-Why are alternative root-cause tools.",
    };
    expect(resolveHumanReviewCriterionDisplay("analyze.sixm_completeness", stored)).toEqual(
      stored
    );
  });

  it("overrides stored copy when human-review entry exists", () => {
    const stored = { label: "Old label", description: "Old description" };
    const display = resolveHumanReviewCriterionDisplay("improve.achievable", stored);
    expect(display.label).toBe(
      "Are the identified corrective actions achievable based on the information provided?"
    );
    expect(display).not.toEqual(stored);
  });
});
