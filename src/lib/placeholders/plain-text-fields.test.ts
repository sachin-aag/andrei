import { describe, expect, it } from "vitest";
import { isPlainTextPlaceholderField } from "./plain-text-fields";

describe("isPlainTextPlaceholderField", () => {
  it("recognizes Analyze 6M / brainstorming string fields", () => {
    expect(isPlainTextPlaceholderField("analyze", "sixM.man")).toBe(true);
    expect(isPlainTextPlaceholderField("analyze", "brainstorming")).toBe(true);
    expect(isPlainTextPlaceholderField("analyze", "otherTools")).toBe(true);
  });

  it("does not treat TipTap rich paths as plain text", () => {
    expect(isPlainTextPlaceholderField("define", "narrative")).toBe(false);
    expect(isPlainTextPlaceholderField("improve", "correctiveActions")).toBe(
      false
    );
    expect(isPlainTextPlaceholderField("control", "preventiveActions")).toBe(
      false
    );
    expect(isPlainTextPlaceholderField("analyze", "fiveWhy.narrative")).toBe(
      false
    );
    expect(
      isPlainTextPlaceholderField("analyze", "investigationOutcome")
    ).toBe(false);
    expect(isPlainTextPlaceholderField("analyze", "impactAssessment")).toBe(
      false
    );
  });
});
