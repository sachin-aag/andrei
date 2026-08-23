import { describe, expect, it } from "vitest";
import {
  SUGGEST_PROMPT_VERSION,
  buildSuggestionSystemPrompt,
  buildSuggestionUserPrompt,
} from "@/lib/ai/suggest-prompts";

describe("buildSuggestionSystemPrompt", () => {
  it("bumps the suggest prompt version when DV table guidance changes", () => {
    expect(SUGGEST_PROMPT_VERSION).toBe("suggest-v19-exact-req-ids-citations");
  });

  it("adds split-citation rules only when citations-at-end is on", () => {
    expect(buildSuggestionSystemPrompt("define")).not.toContain(
      "CITATIONS AT END OF SECTION"
    );
    expect(
      buildSuggestionSystemPrompt("define", { citationsAtEndOfSection: true })
    ).toContain("CITATIONS AT END OF SECTION");
    const user = buildSuggestionUserPrompt({
      section: "define",
      contentStr: "Output power met the acceptance limit.",
      priorBlock: "",
      failingCriteria: [
        {
          key: "define.datetime",
          label: "Date/time",
          reasoning: "Missing measured value",
          status: "not_met",
        },
      ],
      citationsAtEndOfSection: true,
    });
    expect(user).toContain('"second"');
    expect(user).toContain("Citations:");
    expect(user).toContain("[protocol.pdf, p. 3]");
    expect(
      buildSuggestionUserPrompt({
        section: "define",
        contentStr: "Hello",
        priorBlock: "",
        failingCriteria: [
          {
            key: "define.datetime",
            label: "Date/time",
            reasoning: "x",
            status: "not_met",
          },
        ],
      })
    ).not.toContain('"second"');
  });

  it("requires fixed matrix headers for traceability suggest fixes", () => {
    const prompt = buildSuggestionSystemPrompt("traceability");
    expect(prompt).toContain('targetField MUST be "table"');
    expect(prompt).toContain("Fixed table formats (required)");
    expect(prompt).toContain("Requirement ID");
    expect(prompt).toContain("Risk Control Link");
    expect(prompt).toContain("never rename, reorder, add, or drop columns");
    expect(prompt).not.toContain("Pass/Fail");
  });

  it("requires fixed matrix headers for test_results suggest fixes", () => {
    const prompt = buildSuggestionSystemPrompt("test_results");
    expect(prompt).toContain('targetField MUST be "table"');
    expect(prompt).toContain("Fixed table formats (required)");
    expect(prompt).toContain("Pass/Fail");
    expect(prompt).toContain("Raw Data Ref");
    expect(prompt).not.toContain("Risk Control Link");
    expect(prompt).not.toContain("configuration for which that P/F was achieved");
  });

  it("requires Satisfied By to include configuration for Convergent results", () => {
    const prompt = buildSuggestionSystemPrompt("results_and_discussions");
    expect(prompt).toContain("Fixed table formats (required)");
    expect(prompt).toContain("Satisfied By");
    expect(prompt).toContain("configuration for which that P/F was achieved");
    expect(prompt).toContain("TOP-00017 PCON");
    expect(prompt).toContain("SW-SST-5.1.1");
    expect(prompt).not.toContain("Results and Discussions field split");
  });

  it("requires testers dates to land in the testers narrative", () => {
    const prompt = buildSuggestionSystemPrompt("testers_dates");
    expect(prompt).toContain('targetField MUST be "testers"');
    expect(prompt).toContain("Do not target startDate or endDate");
    expect(prompt).toContain('targetField MUST be one of: testers');
  });

  it("omits DV matrix guidance for narrative investigation sections", () => {
    const prompt = buildSuggestionSystemPrompt("define");
    expect(prompt).not.toContain("Fixed table formats (required)");
    expect(prompt).toContain('targetField MUST be one of: narrative');
  });
});
