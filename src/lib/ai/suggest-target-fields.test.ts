import { describe, expect, it } from "vitest";
import {
  concreteTargetFields,
  isAllowedTargetField,
  isRichTargetField,
  resolveTargetField,
} from "@/lib/ai/suggest-target-fields";
import { chatTargetFields } from "@/lib/ai/chat/fields";
import type { DocumentType } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";
import { workspaceSections } from "@/lib/document-types/types";
import {
  RICH_FIELD_PATHS,
  SUGGEST_TARGET_FIELD_PATTERNS,
} from "./suggest-target-fields";

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
    expect(concreteTargetFields("testers_dates")).toEqual(["testers"]);
    expect(isRichTargetField("testers_dates", "testers")).toBe(true);
    expect(isRichTargetField("testers_dates", "startDate")).toBe(false);
    expect(chatTargetFields("testers_dates").map((f) => f.targetField)).toEqual([
      "testers",
    ]);
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
    expect(resolveTargetField("testers_dates", "testers_dates")).toBe("testers");
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
    expect(resolveTargetField("testers_dates", "startDate")).toBeNull();
    expect(resolveTargetField("testers_dates", "endDate")).toBeNull();
    expect(
      resolveTargetField("results_and_discussions", "results_and_discussions")
    ).toBeNull();
  });

  it("rejects unknown fields", () => {
    expect(resolveTargetField("purpose_scope", "bogus")).toBeNull();
  });
});

const ALL_TYPES: readonly DocumentType[] = [
  "investigation_report",
  "failure_investigation_report",
  "design_verification",
  "mechanical_design_verification",
  "quality_risk_assessment",
  "equipment_lifecycle_report",
  "generic_document",
];

describe("suggest target field coverage", () => {
  for (const type of ALL_TYPES) {
    it(`registers every editable ${type} section in both field maps`, () => {
      const def = getDocumentType(type);
      const missingSuggest: string[] = [];
      const missingRich: string[] = [];

      for (const section of workspaceSections(def)) {
        if (!section.editable) continue;
        // Absent is the bug: `undefined` reaches `.join()` and the per-type
        // `pickPatterns` helper silently substitutes []. An explicitly declared
        // [] is a deliberate "no editable text fields" (e.g. DV cover_page,
        // whose values live in reports.metadata).
        if (!(section.key in SUGGEST_TARGET_FIELD_PATTERNS)) {
          missingSuggest.push(section.key);
        }
        if (!(section.key in RICH_FIELD_PATHS)) {
          missingRich.push(section.key);
        }
      }

      expect({ missingSuggest, missingRich }).toEqual({
        missingSuggest: [],
        missingRich: [],
      });
    });
  }

  it("declares a non-empty field list for every DS section", () => {
    // Investigation Report DS has no virtual sections, so every one of its
    // sections must have somewhere for a suggestion to land.
    const def = getDocumentType("failure_investigation_report");
    for (const section of workspaceSections(def)) {
      expect(SUGGEST_TARGET_FIELD_PATTERNS[section.key]?.length ?? 0).toBeGreaterThan(0);
      expect(RICH_FIELD_PATHS[section.key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("keeps every declared field path inside its section's rich paths", () => {
    // A suggestion target that is not a rich field (or a known scalar) cannot
    // be applied — the locator has nothing to write into.
    const def = getDocumentType("failure_investigation_report");
    for (const section of workspaceSections(def)) {
      const targets = def.suggestTargetFieldPatterns[section.key] ?? [];
      const rich = def.richFieldPaths[section.key] ?? [];
      for (const target of targets) {
        expect(rich).toContain(target);
      }
    }
  });
});
