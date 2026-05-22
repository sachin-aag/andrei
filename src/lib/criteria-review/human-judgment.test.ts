import { describe, expect, it } from "vitest";
import {
  getHumanSubAnswerValidationError,
  humanCommentRequired,
  isHumanSubAnswerComplete,
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

describe("isHumanSubAnswerComplete", () => {
  it("is false when agreement answers are missing", () => {
    expect(
      isHumanSubAnswerComplete({
        section: "define",
        criterionKey: "define.what_happened",
      })
    ).toBe(false);
  });

  it("is false when comment is too short", () => {
    expect(
      isHumanSubAnswerComplete({
        section: "define",
        criterionKey: "define.what_happened",
        criteriaEvaluationAgreement: "yes",
        reasoningAgreement: "no",
        comment: "short",
      })
    ).toBe(false);
  });

  it("is false when suggested status is missing for rejected evaluation", () => {
    expect(
      isHumanSubAnswerComplete({
        section: "define",
        criterionKey: "define.what_happened",
        criteriaEvaluationAgreement: "no",
        reasoningAgreement: "yes",
        comment: "This status should be changed based on the section evidence.",
      })
    ).toBe(false);
  });

  it("is true when both answers are yes and no comment is required", () => {
    expect(
      isHumanSubAnswerComplete({
        section: "define",
        criterionKey: "define.what_happened",
        criteriaEvaluationAgreement: "yes",
        reasoningAgreement: "yes",
      })
    ).toBe(true);
  });
});

describe("getHumanSubAnswerValidationError", () => {
  it("returns a generic message when required fields are missing", () => {
    expect(
      getHumanSubAnswerValidationError({
        section: "define",
        criterionKey: "define.what_happened",
      })
    ).toMatch(/Complete all required fields/);
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
