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
    expect(elrPlanRequiredFields("elr_conclusion")).toEqual([
      "narrative",
      "recommendation",
      "recommendationNarrative",
    ]);
    expect(elrPlanRequiredFields("elr_system_trends")).toEqual(["narrative"]);
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

  it("does not complete 5.1 on edit_table alone, and does not require a count digit", () => {
    expect(
      elrPlanSectionCompleteFromParts("elr_system_trends", [
        {
          type: "tool-edit_table",
          state: "output-available",
          input: { section: "elr_system_trends" },
        },
      ])
    ).toBe(false);
    expect(
      elrPlanSectionCompleteFromParts("elr_system_trends", [
        {
          type: "tool-edit_table",
          state: "output-available",
          input: { section: "elr_system_trends" },
        },
        {
          type: "tool-draft_field",
          state: "output-available",
          input: {
            section: "elr_system_trends",
            targetField: "narrative",
            markdown:
              "No recurring theme cut across sections. Runtime was not recorded this period.",
          },
        },
      ])
    ).toBe(true);
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

  it("requires conclusion recap, recommendation, and a dated 6.0", () => {
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
    ).toBe(false);
    expect(
      elrPlanSectionCompleteFromParts("elr_conclusion", [
        {
          type: "tool-draft_field",
          state: "output-available",
          input: {
            section: "elr_conclusion",
            targetField: "narrative",
            markdown:
              "- 3.6 Monitoring — no excursions this period.\n- 4.0 Discrepancy — none observed.",
          },
        },
        {
          type: "tool-draft_field",
          state: "output-available",
          input: {
            section: "elr_conclusion",
            targetField: "recommendation",
            markdown: "continue",
          },
        },
        {
          type: "tool-draft_field",
          state: "output-available",
          input: {
            section: "elr_conclusion",
            targetField: "recommendationNarrative",
            markdown: "No action required.",
          },
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
            targetField: "narrative",
            markdown:
              "- 3.6 Monitoring — no excursions this period.\n- 4.0 Discrepancy — none observed.",
          },
        },
        {
          type: "tool-draft_field",
          state: "output-available",
          input: {
            section: "elr_conclusion",
            targetField: "recommendation",
            markdown: "continue",
          },
        },
        {
          type: "tool-draft_field",
          state: "output-available",
          input: {
            section: "elr_conclusion",
            targetField: "recommendationNarrative",
            markdown:
              "Next PRQ is due 15 August 2027 on the yearly VMP cycle.",
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

describe("elr access control annexure coverage", () => {
  const sop = "SOP-DP-PR-040-R01 SOP.pdf";

  function parts(args: {
    serials: number[];
    citePages: number[];
    includeContinuation?: boolean;
  }) {
    const rows = args.serials.map((serial) => [`${serial}`, `Task ${serial}`]);
    const cites = args.citePages
      .map((page) => `[${sop}, p. ${page}]`)
      .join(" and ");
    return [
      {
        type: "tool-read_document_page",
        state: "output-available",
        input: { attachmentId: "att-sop", pageNumber: 23 },
        output: {
          status: "found",
          nextPage: 24,
          page: {
            filename: sop,
            pageNumber: 23,
            transcript: "Page 23 of 24\n1 Equipment start",
          },
          ...(args.includeContinuation
            ? {
                continuation: {
                  citation: `[${sop}, p. 24]`,
                  page: {
                    filename: sop,
                    pageNumber: 24,
                    transcript: "Page 24 of 24\n20 Filling machine",
                  },
                },
              }
            : {}),
        },
      },
      {
        type: "tool-edit_table",
        state: "output-available",
        input: {
          section: "elr_access_control",
          operation: { kind: "insert_rows", tableIndex: 0, rows },
        },
      },
      {
        type: "tool-draft_field",
        state: "output-available",
        input: {
          section: "elr_access_control",
          targetField: "narrative",
          markdown: `${args.serials.length} privilege rows copied from ${cites}.`,
        },
      },
    ];
  }

  it("stays incomplete when Sr. numbering skips mid-page rows", () => {
    expect(
      elrPlanSectionCompleteFromParts(
        "elr_access_control",
        parts({
          serials: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19],
          citePages: [23],
          includeContinuation: true,
        })
      )
    ).toBe(false);
  });

  it("stays incomplete when the continuation page was served but not cited", () => {
    expect(
      elrPlanSectionCompleteFromParts(
        "elr_access_control",
        parts({
          serials: Array.from({ length: 28 }, (_, i) => i + 1),
          citePages: [23],
          includeContinuation: true,
        })
      )
    ).toBe(false);
  });

  it("completes when Sr. 1..N is contiguous and both annexure pages are cited", () => {
    expect(
      elrPlanSectionCompleteFromParts(
        "elr_access_control",
        parts({
          serials: Array.from({ length: 28 }, (_, i) => i + 1),
          citePages: [23, 24],
          includeContinuation: true,
        })
      )
    ).toBe(true);
  });
});
