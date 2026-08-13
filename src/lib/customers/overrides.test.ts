import { describe, expect, it } from "vitest";
import { applyCriterionDescriptionOverrides } from "./overrides";

describe("applyCriterionDescriptionOverrides", () => {
  const bySection = {
    define: [
      { key: "define.what_happened", description: "shared wording" },
      { key: "define.location", description: "shared location" },
    ],
  };

  it("returns the same object when the override map is empty", () => {
    expect(applyCriterionDescriptionOverrides(bySection, {})).toBe(bySection);
  });

  it("replaces matching descriptions and leaves the rest", () => {
    const result = applyCriterionDescriptionOverrides(bySection, {
      "define.what_happened": "MJ wording",
    });
    expect(result.define?.map((c) => c.description)).toEqual([
      "MJ wording",
      "shared location",
    ]);
  });

  it("fails the build when an override key is not in the shared list", () => {
    expect(() =>
      applyCriterionDescriptionOverrides(bySection, {
        "define.does_not_exist": "orphan",
      })
    ).toThrow(/define.does_not_exist/);
  });
});
