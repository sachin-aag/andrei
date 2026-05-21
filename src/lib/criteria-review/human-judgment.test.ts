import { describe, expect, it } from "vitest";
import {
  humanCommentRequired,
  validateHumanReview,
  validateHumanSubAnswer,
} from "@/lib/criteria-review/human-judgment";

describe("humanCommentRequired", () => {
  it("is false only when both agreement answers are yes", () => {
    expect(humanCommentRequired("yes", "yes")).toBe(false);
    expect(humanCommentRequired("yes", "partially")).toBe(true);
    expect(humanCommentRequired("no", "yes")).toBe(true);
  });
});

describe("validateHumanSubAnswer", () => {
  it("requires comment unless both answers are yes", () => {
    expect(
      validateHumanSubAnswer({
        section: "define",
        criterionKey: "define.what_happened",
        criteriaEvaluationAgreement: "yes",
        reasoningAgreement: "no",
        comment: "short",
      })
    ).toMatch(/at least 20/);
  });

  it("requires corrected traffic-light status when criteria evaluation is rejected", () => {
    expect(
      validateHumanSubAnswer({
        section: "define",
        criterionKey: "define.what_happened",
        criteriaEvaluationAgreement: "no",
        reasoningAgreement: "yes",
        comment: "This status should be changed based on the section evidence.",
      })
    ).toMatch(/Correct traffic-light status/);
  });
});

describe("validateHumanReview", () => {
  it("requires all criterion keys on complete", () => {
    const err = validateHumanReview(
      [
        {
          section: "define",
          criterionKey: "define.what_happened",
          criteriaEvaluationAgreement: "yes",
          reasoningAgreement: "yes",
        },
      ],
      ["define::define.what_happened", "define::define.what_is_different"]
    );
    expect(err).toMatch(/Expected 2/);
  });
});
