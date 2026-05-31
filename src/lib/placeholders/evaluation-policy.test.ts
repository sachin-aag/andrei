import { describe, expect, it } from "vitest";
import {
  capEvaluationStatusForPlaceholders,
  isPlaceholderOnlyEvaluationReasoning,
  shouldSkipSuggestForEvaluation,
} from "./evaluation-policy";

describe("evaluation-policy", () => {
  it("detects placeholder-only reasoning", () => {
    expect(
      isPlaceholderOnlyEvaluationReasoning(
        "CAPA tracking is represented; complete [CAPA number: <to be filled>] in the Placeholders panel."
      )
    ).toBe(true);
    expect(
      isPlaceholderOnlyEvaluationReasoning(
        "Missing governing SOP number and section; no reference to SOP/DP/QA/008."
      )
    ).toBe(false);
  });

  it("caps not_met to partially_met when placeholders remain", () => {
    expect(
      capEvaluationStatusForPlaceholders(
        "not_met",
        "Complete the date placeholder in the Placeholders panel.",
        true
      )
    ).toBe("partially_met");
    expect(
      capEvaluationStatusForPlaceholders(
        "not_met",
        "No mention of deviation number.",
        true
      )
    ).toBe("not_met");
  });

  it("skips suggest for placeholder-only gaps", () => {
    expect(
      shouldSkipSuggestForEvaluation(
        "Responsible person and due date placeholders still need to be filled."
      )
    ).toBe(true);
  });
});
