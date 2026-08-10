import { describe, expect, it } from "vitest";
import {
  SUGGEST_PROMPT_VERSION,
  buildSuggestionSystemPrompt,
} from "@/lib/ai/suggest-prompts";

describe("buildSuggestionSystemPrompt", () => {
  it("bumps the suggest prompt version when DV table guidance changes", () => {
    expect(SUGGEST_PROMPT_VERSION).toBe("suggest-v12-dv-fixed-table-formats");
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
  });

  it("omits DV matrix guidance for narrative investigation sections", () => {
    const prompt = buildSuggestionSystemPrompt("define");
    expect(prompt).not.toContain("Fixed table formats (required)");
    expect(prompt).toContain('targetField MUST be one of: narrative');
  });
});
