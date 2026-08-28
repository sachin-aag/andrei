import { describe, expect, it } from "vitest";
import { chatWorkProductTarget, shouldRevealCriteriaTab } from "./workspace-chrome";

describe("shouldRevealCriteriaTab", () => {
  it("reveals Criteria when an Agent-chrome eval finishes on the report", () => {
    expect(
      shouldRevealCriteriaTab({
        wasEvaluating: true,
        isEvaluating: false,
        chrome: "agent",
        workProductView: "report",
      })
    ).toBe(true);
  });

  it("stays put while eval is still running or never started", () => {
    expect(
      shouldRevealCriteriaTab({
        wasEvaluating: true,
        isEvaluating: true,
        chrome: "agent",
        workProductView: "report",
      })
    ).toBe(false);
    expect(
      shouldRevealCriteriaTab({
        wasEvaluating: false,
        isEvaluating: false,
        chrome: "agent",
        workProductView: "report",
      })
    ).toBe(false);
  });

  it("does not steal the tab in Document chrome or on Analytics", () => {
    expect(
      shouldRevealCriteriaTab({
        wasEvaluating: true,
        isEvaluating: false,
        chrome: "document",
        workProductView: "report",
      })
    ).toBe(false);
    expect(
      shouldRevealCriteriaTab({
        wasEvaluating: true,
        isEvaluating: false,
        chrome: "agent",
        workProductView: "analytics",
      })
    ).toBe(false);
  });
});

describe("chatWorkProductTarget", () => {
  it("follows the focused pane in Document chrome", () => {
    expect(
      chatWorkProductTarget({
        chrome: "document",
        workProductView: "analytics",
        agentTarget: "report",
        statsEnabled: true,
      })
    ).toBe("analytics");
  });

  it("uses the Agent dropdown, not the focused pane", () => {
    expect(
      chatWorkProductTarget({
        chrome: "agent",
        workProductView: "report",
        agentTarget: "analytics",
        statsEnabled: true,
      })
    ).toBe("analytics");
  });

  it("stays on report when Statistical Analysis is off", () => {
    expect(
      chatWorkProductTarget({
        chrome: "agent",
        workProductView: "analytics",
        agentTarget: "analytics",
        statsEnabled: false,
      })
    ).toBe("report");
  });
});
