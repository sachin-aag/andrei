import { describe, expect, it } from "vitest";
import { buildCriteriaOutline } from "./criteria-outline";
import { chatEditableSections, parseChatSectionScope } from "./fields";
import { detectSectionIntentFromText } from "./section-intent";

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
    expect(detectSectionIntentFromText("Draft the root cause in Analyze")).toBe(
      "analyze"
    );
  });

  it("returns null when no section is clear", () => {
    expect(detectSectionIntentFromText("hello there")).toBeNull();
  });

  it("detects design-verification sections from DV phrasing", () => {
    expect(
      detectSectionIntentFromText(
        "Draft the purpose and scope",
        "design_verification"
      )
    ).toBe("purpose_scope");
    expect(
      detectSectionIntentFromText(
        "Update the traceability matrix",
        "design_verification"
      )
    ).toBe("traceability");
    expect(
      detectSectionIntentFromText(
        "Fill in the test methods and acceptance criteria",
        "design_verification"
      )
    ).toBe("test_methods");
  });

  it("never returns a section outside the DV editable set", () => {
    const editable = new Set(chatEditableSections("design_verification"));
    for (const text of [
      "Draft the purpose and scope",
      "Update the traceability matrix",
      "Fill test results pass-fail",
      "Add the conclusion",
      "Draft define section",
    ]) {
      const intent = detectSectionIntentFromText(text, "design_verification");
      if (intent) expect(editable.has(intent)).toBe(true);
    }
    expect(
      detectSectionIntentFromText("Draft define section", "design_verification")
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
