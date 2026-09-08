import { describe, expect, it } from "vitest";
import { chatEditableSections } from "./fields";
import { detectSectionIntentFromText } from "./section-intent";

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

  it("detects ELR Objective so a named draft does not look like an inventory", () => {
    expect(
      detectSectionIntentFromText(
        "draft the objective section",
        "equipment_lifecycle_report"
      )
    ).toBe("elr_objective");
    expect(
      detectSectionIntentFromText(
        "Draft the Objective and Scope for this ELR period.",
        "equipment_lifecycle_report"
      )
    ).toBe("elr_objective");
    expect(
      detectSectionIntentFromText(
        "Build the qualification history table from the attached protocols",
        "equipment_lifecycle_report"
      )
    ).toBe("elr_qualification");
    expect(
      detectSectionIntentFromText(
        "draft the access control table",
        "equipment_lifecycle_report"
      )
    ).toBe("elr_access_control");
  });
});
