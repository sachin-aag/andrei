import { describe, expect, it } from "vitest";
import { buildCriteriaOutline } from "./criteria-outline";
import { parseChatSectionScope } from "./fields";
import {
  detectSectionIntentFromText,
  detectSectionScopeMismatch,
} from "./section-intent";

describe("parseChatSectionScope", () => {
  it("defaults unknown values to all", () => {
    expect(parseChatSectionScope(undefined)).toBe("all");
    expect(parseChatSectionScope("bogus")).toBe("all");
  });

  it("accepts all and editable section ids", () => {
    expect(parseChatSectionScope("all")).toBe("all");
    expect(parseChatSectionScope("analyze")).toBe("analyze");
  });
});

describe("detectSectionIntentFromText", () => {
  it("detects analyze intent from root cause phrasing", () => {
    expect(detectSectionIntentFromText("Draft the root cause in Analyze")).toBe("analyze");
  });

  it("returns null when no section is clear", () => {
    expect(detectSectionIntentFromText("hello there")).toBeNull();
  });
});

describe("detectSectionScopeMismatch", () => {
  it("flags when scoped section differs from message intent", () => {
    const mismatch = detectSectionScopeMismatch(
      "define",
      "Please improve the root cause narrative"
    );
    expect(mismatch?.suggestedSection).toBe("analyze");
    expect(mismatch?.currentSection).toBe("define");
  });

  it("returns null when scope is all", () => {
    expect(
      detectSectionScopeMismatch("all", "Draft the root cause in Analyze")
    ).toBeNull();
  });
});

describe("buildCriteriaOutline scope", () => {
  it("filters to a single section when scoped", () => {
    const scoped = buildCriteriaOutline("define");
    const all = buildCriteriaOutline("all");
    expect(scoped).toContain("[define]:");
    expect(scoped).not.toContain("[measure]:");
    expect(all).toContain("[measure]:");
  });
});
