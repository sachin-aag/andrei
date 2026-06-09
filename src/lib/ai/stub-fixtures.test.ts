import { describe, expect, it } from "vitest";
import { assertStubEvaluationsComplete } from "@/lib/ai/stub-evaluations";
import { assertStubSuggestionsShape } from "@/lib/ai/stub-suggestions";
import { isAllowedTargetField } from "@/lib/ai/suggest-target-fields";
import stubSuggestionsJson from "@/lib/ai/fixtures/stub-suggestions.json";

describe("AI stub fixtures", () => {
  it("covers all evaluable criterion keys", () => {
    expect(() => assertStubEvaluationsComplete()).not.toThrow();
  });

  it("stub suggestions have valid anchor/delete/insert shape", () => {
    expect(() => assertStubSuggestionsShape()).not.toThrow();
  });

  it("stub suggestion target fields are allowed for their section", () => {
    for (const entry of stubSuggestionsJson as Array<{
      section: "define";
      targetField: string;
      criterionKey: string;
    }>) {
      expect(
        isAllowedTargetField(entry.section, entry.targetField),
        entry.criterionKey
      ).toBe(true);
    }
  });
});
