import { describe, expect, it } from "vitest";
import {
  evaluateHarnessScenario,
  evaluateHarnessScenarios,
  HARNESS_SCENARIOS,
} from "./harness-scenarios";

describe("harness scenarios (F1 layer 1)", () => {
  it("covers the §13 quality-floor turns", () => {
    expect(HARNESS_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "greeting",
      "sentence_rewrite",
      "placeholder_fill",
      "empty_inventory",
      "identifier_lookup",
    ]);
  });

  it("greeting: no search, no review, no write tools", () => {
    const result = evaluateHarnessScenario(HARNESS_SCENARIOS[0]!);
    expect(result.plan.intent).toBe("social");
    expect(result.plan.retrievalPolicy).toBe("focused");
    expect(result.plan.retrievalReason).toBe("no_task");
    expect(result.firstStep).toEqual({ activeTools: [] });
  });

  it("sentence rewrite of a filled section forces read_section, not a page walk", () => {
    const result = evaluateHarnessScenario(HARNESS_SCENARIOS[1]!);
    expect(result.plan.intent).toBe("write");
    expect(result.plan.alreadyDrafted?.section).toBe("purpose_scope");
    expect(result.plan.retrievalPolicy).not.toBe("comprehensive");
    expect(result.firstStep).toEqual({
      activeTools: ["read_section"],
      toolChoice: { type: "tool", toolName: "read_section" },
    });
    expect(result.firstStep.activeTools).not.toContain("start_document_review");
  });

  it("placeholder fill of a populated table stays adaptive", () => {
    const result = evaluateHarnessScenario(HARNESS_SCENARIOS[2]!);
    expect(result.plan.retrievalPolicy).toBe("adaptive");
    expect(result.plan.retrievalReason).toBe("placeholder_fill");
    expect(result.requireInventoryReview).toBe(false);
    expect(result.firstStep.activeTools).toContain("search_documents");
    expect(result.firstStep.activeTools).not.toContain("start_document_review");
    expect(result.firstStep.toolChoice).toBeUndefined();
  });

  it("empty ELR inventory still starts a document review", () => {
    const result = evaluateHarnessScenario(HARNESS_SCENARIOS[3]!);
    expect(result.requireInventoryReview).toBe(true);
    expect(result.firstStep).toEqual({
      activeTools: ["start_document_review"],
      toolChoice: { type: "tool", toolName: "start_document_review" },
    });
  });

  it("single identifier lookup does not start a page walk", () => {
    const result = evaluateHarnessScenario(HARNESS_SCENARIOS[4]!);
    expect(result.plan.intent).not.toBe("write");
    expect(result.plan.retrievalPolicy).not.toBe("comprehensive");
    expect(result.firstStep.activeTools).toContain("search_documents");
    expect(result.firstStep.activeTools).not.toContain("start_document_review");
    expect(result.firstStep.activeTools).not.toContain("draft_field");
  });

  it("reports one row per scenario", () => {
    const rows = evaluateHarnessScenarios();
    expect(rows).toHaveLength(HARNESS_SCENARIOS.length);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });
});
