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
      "purpose",
      "scope",
      "methods_of_measurement",
      "problems_resolution",
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
    for (const section of ["traceability", "test_results", "test_equipment"] as const) {
      expect(concreteTargetFields(section)).toEqual(["table"]);
      expect(isAllowedTargetField(section, "table")).toBe(true);
      expect(isRichTargetField(section, "table")).toBe(true);
    }
    expect(concreteTargetFields("results_and_discussions")).toEqual([
      "narrative",
      "table",
    ]);
    expect(concreteTargetFields("testers_dates")).toEqual([
      "testers",
      "startDate",
      "endDate",
    ]);
    expect(isRichTargetField("testers_dates", "testers")).toBe(true);
    expect(isRichTargetField("testers_dates", "startDate")).toBe(false);
  });
});

describe("resolveTargetField", () => {
  it("remaps section key to the sole field when models confuse them", () => {
    expect(resolveTargetField("purpose_scope", "purpose_scope")).toBe("narrative");
    expect(resolveTargetField("references", "references")).toBe("narrative");
    expect(resolveTargetField("traceability", "traceability")).toBe("table");
    expect(resolveTargetField("test_results", "test_results")).toBe("table");
    expect(resolveTargetField("control", "control")).toBe("preventiveActions");
    expect(resolveTargetField("testers_dates", "testers")).toBe("testers");
    expect(resolveTargetField("test_equipment", "test_equipment")).toBe("table");
    expect(resolveTargetField("purpose", "purpose")).toBe("narrative");
  });

  it("keeps a correct field path unchanged", () => {
    expect(resolveTargetField("purpose_scope", "narrative")).toBe("narrative");
    expect(resolveTargetField("improve", "correctiveActions")).toBe(
      "correctiveActions"
    );
  });

  it("does not guess when a section has multiple fields", () => {
    expect(resolveTargetField("improve", "improve")).toBeNull();
    expect(resolveTargetField("analyze", "analyze")).toBeNull();
    expect(resolveTargetField("testers_dates", "testers_dates")).toBeNull();
    expect(
      resolveTargetField("results_and_discussions", "results_and_discussions")
    ).toBeNull();
  });

  it("rejects unknown fields", () => {
    expect(resolveTargetField("purpose_scope", "bogus")).toBeNull();
  });
});
