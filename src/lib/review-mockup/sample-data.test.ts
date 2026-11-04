import { describe, expect, it } from "vitest";
import {
  allRecommendedFindings,
  agentsInCategory,
  countBySeverity,
  findingById,
  recommendedAgents,
  REVIEW_AGENTS,
  REVIEW_FINDINGS,
  TRACE_SUMMARY,
} from "./sample-data";

describe("review mockup sample data", () => {
  it("has fourteen recommended agents", () => {
    expect(recommendedAgents()).toHaveLength(14);
    expect(REVIEW_AGENTS.every((agent) => agent.categories.includes("recommended"))).toBe(
      true
    );
  });

  it("keeps category filters as subsets of recommended", () => {
    expect(agentsInCategory("qms").length).toBeGreaterThan(0);
    expect(agentsInCategory("design").length).toBeGreaterThan(0);
    expect(agentsInCategory("requirements").length).toBeGreaterThan(0);
  });

  it("counts recommended findings by severity", () => {
    const counts = countBySeverity(allRecommendedFindings());
    expect(counts.critical).toBeGreaterThanOrEqual(3);
    expect(counts.major).toBeGreaterThanOrEqual(2);
    expect(counts.critical + counts.major + counts.minor).toBe(
      new Set(recommendedAgents().flatMap((agent) => agent.findingIds)).size
    );
  });

  it("resolves the screenshot findings", () => {
    expect(findingById("di-038")?.severity).toBe("critical");
    expect(findingById("tm-02-subjective")?.suggestedReplacement).toContain("±5 g");
    expect(findingById("rc-12")?.anchorId).toBe("ref-rmf");
  });

  it("keeps every finding id unique and anchored", () => {
    const ids = REVIEW_FINDINGS.map((finding) => finding.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REVIEW_FINDINGS.every((finding) => finding.anchorId.length > 0)).toBe(true);
  });

  it("summarizes the trace matrix", () => {
    expect(TRACE_SUMMARY.gaps).toBe(2);
    expect(TRACE_SUMMARY.weak).toBe(2);
    expect(TRACE_SUMMARY.traced).toBe(3);
  });
});
