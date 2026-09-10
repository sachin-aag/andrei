import { describe, expect, it } from "vitest";
import {
  engineerFacingChangeLines,
  engineerFacingHistorySummary,
} from "./change-summary";

describe("engineerFacingChangeLines", () => {
  it("shows section labels without targetField keys", () => {
    const lines = engineerFacingChangeLines([
      {
        section: "purpose",
        targetField: "narrative",
        reasoning: "Draft Purpose from the test plan.",
      },
      {
        section: "testers_dates",
        targetField: "testers",
        reasoning: "Draft Testers/Dates from the protocol.",
      },
      {
        section: "requirements_verified",
        targetField: "hardwareTable",
        reasoning: "Fill the hardware results table.",
      },
    ]);
    expect(lines.map((line) => [line.label, line.reasoning])).toEqual([
      ["Purpose", "Draft Purpose from the test plan."],
      ["Testers/Dates", "Draft Testers/Dates from the protocol."],
      ["Requirements Verified", "Fill the hardware results table."],
    ]);
  });

  it("coalesces recipe-slot edits in the same section into one line", () => {
    const lines = engineerFacingChangeLines([
      {
        section: "units_under_test",
        targetField: "narrative",
        reasoning: "Draft Units Under Test from the protocol.",
      },
      {
        section: "units_under_test",
        targetField: "table",
        reasoning: "Populate Table 1 for Units Under Test.",
      },
      {
        section: "units_under_test",
        targetField: "table",
        reasoning: "Re-create Table 1 properly with create_table.",
      },
    ]);
    expect(lines).toEqual([
      {
        section: "units_under_test",
        label: "Units Under Test",
        reasoning: "Draft Units Under Test from the protocol.",
      },
    ]);
  });

  it("fills reasoning from a later edit when the first is blank", () => {
    const lines = engineerFacingChangeLines([
      { section: "scope", targetField: "narrative", reasoning: "  " },
      {
        section: "scope",
        targetField: "narrative",
        reasoning: "Draft Scope citing the test plan.",
      },
    ]);
    expect(lines[0]?.reasoning).toBe("Draft Scope citing the test plan.");
  });
});

describe("engineerFacingHistorySummary", () => {
  it("joins section labels and never falls back to a field key", () => {
    expect(
      engineerFacingHistorySummary([
        { section: "purpose", targetField: "narrative", reasoning: "" },
        {
          section: "scope",
          targetField: "narrative",
          reasoning: "Draft Scope citing requirements.",
        },
      ])
    ).toBe("Purpose; Scope — Draft Scope citing requirements.");
  });
});
