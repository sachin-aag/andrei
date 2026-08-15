import { describe, expect, it } from "vitest";
import {
  effectivePlainTextContentPath,
  resolveSuggestionFieldPath,
  suggestionFieldAnchorKey,
  suggestionTargetsField,
} from "@/lib/suggestions/resolve-suggestion-field-path";

describe("suggestionTargetsField", () => {
  it("routes a legacy improve narrative suggestion to correctiveActions only", () => {
    expect(suggestionTargetsField("improve", "narrative", "correctiveActions")).toBe(
      true
    );
    expect(suggestionTargetsField("improve", "narrative", "narrative")).toBe(false);
  });

  it("routes a legacy control narrative suggestion to preventiveActions only", () => {
    expect(suggestionTargetsField("control", "narrative", "preventiveActions")).toBe(
      true
    );
    expect(suggestionTargetsField("control", "narrative", "narrative")).toBe(false);
  });

  it("matches only the narrative box in measure", () => {
    expect(suggestionTargetsField("measure", "narrative", "narrative")).toBe(true);
    expect(suggestionTargetsField("measure", "narrative", "purpose")).toBe(false);
    expect(suggestionTargetsField("measure", "narrative", "conclusion")).toBe(false);
  });

  it("keeps distinct analyze fields apart", () => {
    expect(
      suggestionTargetsField("analyze", "rootCause.narrative", "rootCause.narrative")
    ).toBe(true);
    expect(
      suggestionTargetsField("analyze", "rootCause.narrative", "impactAssessment")
    ).toBe(false);
  });
});

describe("legacy measure remap", () => {
  const legacyFields = [
    "purpose",
    "conclusion",
    "experimentNumber",
    "experimentTitle",
  ] as const;

  it("resolves legacy measure fields to the narrative", () => {
    for (const field of legacyFields) {
      expect(resolveSuggestionFieldPath("measure", field, field)).toBe("narrative");
      expect(effectivePlainTextContentPath("measure", field)).toBe("narrative");
      expect(suggestionTargetsField("measure", field, "narrative")).toBe(true);
      expect(suggestionFieldAnchorKey("measure", field)).toBe("measure.narrative");
    }
  });

  it("leaves other sections' same-named fields alone", () => {
    expect(resolveSuggestionFieldPath("analyze", "conclusion", "conclusion")).toBe(
      "conclusion"
    );
    expect(suggestionFieldAnchorKey("analyze", "conclusion")).toBe(
      "analyze.conclusion"
    );
  });
});
