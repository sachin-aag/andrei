import { describe, expect, it } from "vitest";
import { buildInactiveSuggestionCss } from "@/lib/tiptap/inactive-suggestion-css";

describe("buildInactiveSuggestionCss", () => {
  it("is empty when no suggestion is active", () => {
    expect(buildInactiveSuggestionCss(null)).toBe("");
  });

  it("only neutralises AI-authored runs", () => {
    const css = buildInactiveSuggestionCss("eval-1");
    const hidingRules = css
      .split("}")
      .filter((block) => block.includes("display: none"));

    expect(hidingRules.length).toBeGreaterThan(0);
    for (const rule of hidingRules) {
      const selectors = rule
        .split("{")[0]!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const selector of selectors) {
        // The reviewer's own track-change marks carry an id too, so a rule that
        // does not name the AI author would hide their typing.
        const scopedToAi = selector.includes('[data-suggestion-author="ai"]');
        const widgetOnly = selector.includes(".suggestion-action-widget");
        expect(scopedToAi || widgetOnly).toBe(true);
      }
    }
  });

  it("keeps the active suggestion out of the neutralised set", () => {
    const css = buildInactiveSuggestionCss("eval-1");
    expect(css).toContain(':not([data-eval-id="eval-1"])');
    expect(css).toContain('[data-active-suggestion-id="eval-1"]');
  });

  it("hides inactive insert figures but does not hide delete-pending figures", () => {
    const css = buildInactiveSuggestionCss("eval-1");
    const hidingRules = css
      .split("}")
      .filter((block) => block.includes("display: none"))
      .join("}");
    expect(hidingRules).toContain(".suggestion-image-insert-ai");
    expect(hidingRules).not.toContain(".suggestion-image-delete");
    expect(css).toContain(".suggestion-image-delete-ai");
  });
});
