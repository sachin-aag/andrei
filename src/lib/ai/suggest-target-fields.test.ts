import { describe, expect, it } from "vitest";
import {
  concreteTargetFields,
  isAllowedTargetField,
  isRichTargetField,
  resolveTargetField,
} from "@/lib/ai/suggest-target-fields";
import { chatTargetFields } from "@/lib/ai/chat/fields";

describe("design verification target fields", () => {
  it("lists narrative for purpose_scope (and other DV narrative sections)", () => {
    for (const section of [
      "purpose_scope",
      "references",
      "test_methods",
      "deviations",
      "approval_signoff",
      "appendices",
    ] as const) {
      expect(concreteTargetFields(section)).toEqual(["narrative"]);
      expect(isAllowedTargetField(section, "narrative")).toBe(true);
      expect(isRichTargetField(section, "narrative")).toBe(true);
      expect(chatTargetFields(section).map((f) => f.targetField)).toEqual([
        "narrative",
      ]);
    }
  });

  it("lists table for traceability and test_results", () => {
    for (const section of ["traceability", "test_results"] as const) {
      expect(concreteTargetFields(section)).toEqual(["table"]);
      expect(isAllowedTargetField(section, "table")).toBe(true);
      expect(isRichTargetField(section, "table")).toBe(true);
    }
  });
});

describe("resolveTargetField", () => {
  it("remaps section key to the sole field when models confuse them", () => {
    expect(resolveTargetField("purpose_scope", "purpose_scope")).toBe("narrative");
    expect(resolveTargetField("references", "references")).toBe("narrative");
    expect(resolveTargetField("traceability", "traceability")).toBe("table");
    expect(resolveTargetField("test_results", "test_results")).toBe("table");
    expect(resolveTargetField("control", "control")).toBe("preventiveActions");
    expect(resolveTargetField("improve", "improve")).toBe("correctiveActions");
    expect(resolveTargetField("define", "define")).toBe("narrative");
  });

  it("keeps a correct field path unchanged", () => {
    expect(resolveTargetField("purpose_scope", "narrative")).toBe("narrative");
    expect(resolveTargetField("improve", "correctiveActions")).toBe(
      "correctiveActions"
    );
  });

  it("does not guess when a section has multiple fields", () => {
    expect(resolveTargetField("analyze", "analyze")).toBeNull();
  });

  it("rejects unknown fields", () => {
    expect(resolveTargetField("purpose_scope", "bogus")).toBeNull();
  });
});
