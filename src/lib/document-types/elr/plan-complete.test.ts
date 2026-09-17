import { describe, expect, it } from "vitest";
import {
  elrIncompleteSectionKeysFromParts,
  elrPlanRequiredFields,
  elrPlanSectionCompleteFromParts,
} from "./plan-complete";

describe("elrPlanRequiredFields", () => {
  it("requires an assessment on evidence sections and siblings on trend/risk/conclusion", () => {
    expect(elrPlanRequiredFields("elr_calibration")).toEqual(["narrative"]);
    expect(elrPlanRequiredFields("elr_media_fill")).toEqual(["narrative"]);
    expect(elrPlanRequiredFields("elr_breakdowns")).toEqual([
      "narrative",
      "trend",
    ]);
    expect(elrPlanRequiredFields("elr_risk_actions")).toEqual([
      "narrative",
      "overallGrade",
    ]);
    expect(elrPlanRequiredFields("elr_conclusion")).toEqual(["recommendation"]);
    expect(elrPlanRequiredFields("elr_objective")).toBeNull();
    expect(elrPlanRequiredFields("define")).toBeNull();
  });
});

describe("elrPlanSectionCompleteFromParts", () => {
  it("does not complete an evidence section on edit_table alone", () => {
    const parts = [
      {
        type: "tool-edit_table",
        state: "output-available",
        input: { section: "elr_breakdowns" },
      },
    ];
    expect(elrPlanSectionCompleteFromParts("elr_breakdowns", parts)).toBe(false);
    expect(elrIncompleteSectionKeysFromParts(parts)).toEqual(["elr_breakdowns"]);
  });

  it("completes when the table, a counted assessment, and trend land together", () => {
    const parts = [
      {
        type: "tool-edit_table",
        state: "output-available",
        input: { section: "elr_breakdowns" },
      },
      {
        type: "tool-draft_field",
        state: "output-available",
        input: {
          section: "elr_breakdowns",
          targetField: "narrative",
          markdown:
            "3 breakdowns this period lost 4.0 h runtime; the qualified state still holds. [[table]]",
        },
      },
      {
        type: "tool-draft_field",
        state: "output-available",
        input: {
          section: "elr_breakdowns",
          targetField: "trend",
          markdown: "Door-seal failures remain the dominant mode.",
        },
      },
    ];
    expect(elrPlanSectionCompleteFromParts("elr_breakdowns", parts)).toBe(true);
    expect(elrIncompleteSectionKeysFromParts(parts)).toEqual([]);
  });

  it("keeps the section incomplete when the assessment has no count", () => {
    const parts = [
      {
        type: "tool-edit_table",
        state: "output-available",
        input: { section: "elr_qms" },
      },
      {
        type: "tool-draft_field",
        state: "output-available",
        input: {
          section: "elr_qms",
          targetField: "narrative",
          markdown: "QMS records for the period were reviewed. [[table]]",
        },
      },
    ];
    expect(elrPlanSectionCompleteFromParts("elr_qms", parts)).toBe(false);
  });

  it("requires conclusion recommendation and risk overallGrade", () => {
    expect(
      elrPlanSectionCompleteFromParts("elr_conclusion", [
        {
          type: "tool-draft_field",
          state: "output-available",
          input: { section: "elr_conclusion", targetField: "narrative" },
        },
      ])
    ).toBe(false);
    expect(
      elrPlanSectionCompleteFromParts("elr_conclusion", [
        {
          type: "tool-draft_field",
          state: "output-available",
          input: {
            section: "elr_conclusion",
            targetField: "recommendation",
            markdown: "continue",
          },
        },
      ])
    ).toBe(true);
    expect(
      elrPlanSectionCompleteFromParts("elr_risk_actions", [
        {
          type: "tool-draft_field",
          state: "output-available",
          input: {
            section: "elr_risk_actions",
            targetField: "narrative",
            markdown: "1 High-priority action from downtime.",
          },
        },
      ])
    ).toBe(false);
  });
});
