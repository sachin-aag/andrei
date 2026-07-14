import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt, isChatMode } from "./system-prompt";

const opts = { contextMap: "CTX_MAP", criteriaOutline: "CRITERIA" };

describe("isChatMode", () => {
  it("accepts only plan and agent", () => {
    expect(isChatMode("plan")).toBe(true);
    expect(isChatMode("agent")).toBe(true);
    expect(isChatMode("draft")).toBe(false);
    expect(isChatMode(undefined)).toBe(false);
  });
});

describe("buildChatSystemPrompt", () => {
  it("plan mode forbids editing and asks questions", () => {
    const prompt = buildChatSystemPrompt({ ...opts, mode: "plan" });
    expect(prompt).toContain("Mode: PLAN");
    expect(prompt).toContain("edit tool is disabled");
    expect(prompt).toContain("follow-up questions");
    expect(prompt).not.toContain("Mode: AGENT");
  });

  it("agent mode enables drafting with skip/placeholder heuristics", () => {
    const prompt = buildChatSystemPrompt({ ...opts, mode: "agent" });
    expect(prompt).toContain("Mode: AGENT");
    expect(prompt).toContain("SKIP the section");
    expect(prompt).toContain("placeholder");
    expect(prompt).not.toContain("Mode: PLAN");
  });

  it("includes the report context and criteria in both modes", () => {
    for (const mode of ["plan", "agent"] as const) {
      const prompt = buildChatSystemPrompt({ ...opts, mode });
      expect(prompt).toContain("CTX_MAP");
      expect(prompt).toContain("CRITERIA");
    }
  });
});
