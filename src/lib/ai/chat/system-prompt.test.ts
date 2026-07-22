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
  it("plan mode forbids editing and asks questions via ask_user", () => {
    const prompt = buildChatSystemPrompt({ ...opts, mode: "plan" });
    expect(prompt).toContain("Mode: PLAN");
    expect(prompt).toContain("edit tools are disabled");
    expect(prompt).toContain("ask_user");
    expect(prompt).not.toContain("Mode: AGENT");
  });

  it("agent mode enables drafting with draft_field and placeholder heuristics", () => {
    const prompt = buildChatSystemPrompt({ ...opts, mode: "agent" });
    expect(prompt).toContain("Mode: AGENT");
    expect(prompt).toContain("draft_field");
    expect(prompt).toContain("placeholder");
    expect(prompt).not.toContain("Mode: PLAN");
  });

  it("uses a demo-wide compliance persona, not a single customer brand", () => {
    const prompt = buildChatSystemPrompt({ ...opts, mode: "plan" });
    expect(prompt).toContain("pharmaceutical and medical device");
    expect(prompt).toContain("deviation");
    expect(prompt).not.toContain("M.J. Biopharm");
    expect(prompt).not.toContain("SOP/DP/QA/008");
  });

  it("scoped mode limits criteria and section focus in the prompt", () => {
    const prompt = buildChatSystemPrompt({
      ...opts,
      mode: "agent",
      sectionScope: "define",
      criteriaOutline: "DEFINE_ONLY",
    });
    expect(prompt).toContain("Section focus: Define [define]");
    expect(prompt).toContain(
      'only call read_section / draft_field / propose_edit on section "define"'
    );
    expect(prompt).toContain("DEFINE_ONLY");
    expect(prompt).not.toContain("[measure]:");
  });

  it("includes scope mismatch guidance when detected", () => {
    const prompt = buildChatSystemPrompt({
      ...opts,
      mode: "plan",
      sectionScope: "define",
      scopeMismatch: {
        currentSection: "define",
        suggestedSection: "analyze",
        reason: "Looks like Analyze.",
      },
    });
    expect(prompt).toContain("Section scope mismatch (detected)");
    expect(prompt).toContain('suggest_section_scope');
    expect(prompt).toContain("Analyze");
  });

  it("includes the report context and criteria in both modes", () => {
    for (const mode of ["plan", "agent"] as const) {
      const prompt = buildChatSystemPrompt({ ...opts, mode });
      expect(prompt).toContain("CTX_MAP");
      expect(prompt).toContain("CRITERIA");
    }
  });
});
