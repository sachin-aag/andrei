import { describe, expect, it } from "vitest";
import { TOOL_RESULT_BUDGET, toolResultBudget } from "./tool-result-budget";

describe("toolResultBudget", () => {
  it("leaves short text intact", () => {
    expect(toolResultBudget("searchExcerpt", "Narda SRM-3006")).toBe(
      "Narda SRM-3006"
    );
  });

  it("clamps long text to the named cap including the ellipsis", () => {
    const long = "x".repeat(TOOL_RESULT_BUDGET.searchExcerptChars + 40);
    const clamped = toolResultBudget("searchExcerpt", long);
    expect(clamped.endsWith("…")).toBe(true);
    expect(clamped.length).toBe(TOOL_RESULT_BUDGET.searchExcerptChars);
  });

  it("treats missing text as empty", () => {
    expect(toolResultBudget("searchExcerpt", undefined)).toBe("");
  });
});
