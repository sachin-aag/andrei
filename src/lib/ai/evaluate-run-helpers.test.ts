import { describe, expect, it } from "vitest";
import { normalizeAnalyzeToolResults } from "@/lib/ai/evaluate-run-helpers";
import type { CriterionEvaluationResult } from "@/lib/ai/evaluate";

function docWith(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const baseEvals: CriterionEvaluationResult[] = [
  {
    criterionKey: "analyze.sixm_completeness",
    criterionLabel: "6M",
    status: "not_met",
    reasoning: "Missing 6M",
  },
  {
    criterionKey: "analyze.fivewhy_completeness",
    criterionLabel: "5-Why",
    status: "not_met",
    reasoning: "Missing 5-Why",
  },
  {
    criterionKey: "analyze.root_cause",
    criterionLabel: "Root cause",
    status: "partially_met",
    reasoning: "Needs levels",
  },
];

describe("normalizeAnalyzeToolResults", () => {
  it("marks unused 6M met when 5-Why is the chosen tool", () => {
    const result = normalizeAnalyzeToolResults(
      {
        fiveWhy: { narrative: docWith("Why 1: seal failed"), conclusion: "" },
        sixM: { man: "Not Applicable" },
        brainstorming: "",
      },
      baseEvals
    );
    expect(result.find((e) => e.criterionKey === "analyze.sixm_completeness")).toMatchObject({
      status: "met",
    });
    expect(
      result.find((e) => e.criterionKey === "analyze.fivewhy_completeness")?.status
    ).toBe("not_met");
    expect(result.find((e) => e.criterionKey === "analyze.root_cause")?.status).toBe(
      "partially_met"
    );
  });

  it("marks unused 5-Why met when 6M is the chosen tool", () => {
    const result = normalizeAnalyzeToolResults(
      {
        sixM: { man: "Training gap", conclusion: "Human factor" },
        fiveWhy: { narrative: docWith(""), conclusion: "" },
        brainstorming: "Not Applicable",
      },
      baseEvals
    );
    expect(
      result.find((e) => e.criterionKey === "analyze.fivewhy_completeness")
    ).toMatchObject({ status: "met" });
    expect(
      result.find((e) => e.criterionKey === "analyze.sixm_completeness")?.status
    ).toBe("not_met");
  });

  it("marks both tool criteria met when brainstorming is the chosen tool", () => {
    const result = normalizeAnalyzeToolResults(
      {
        sixM: { man: "Not Applicable" },
        fiveWhy: { narrative: docWith("Not Applicable"), conclusion: "" },
        brainstorming: "Possible causes listed in session notes",
      },
      baseEvals
    );
    expect(
      result.find((e) => e.criterionKey === "analyze.sixm_completeness")
    ).toMatchObject({
      status: "met",
      reasoning: expect.stringContaining("Brainstorming"),
    });
    expect(
      result.find((e) => e.criterionKey === "analyze.fivewhy_completeness")
    ).toMatchObject({
      status: "met",
      reasoning: expect.stringContaining("Brainstorming"),
    });
  });

  it("leaves evaluations unchanged when no single method is detected", () => {
    const result = normalizeAnalyzeToolResults(
      {
        sixM: {},
        fiveWhy: { narrative: docWith(""), conclusion: "" },
        brainstorming: "",
      },
      baseEvals
    );
    expect(result).toEqual(baseEvals);
  });
});
