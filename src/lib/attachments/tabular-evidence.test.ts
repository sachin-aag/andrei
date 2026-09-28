import { describe, expect, it } from "vitest";
import {
  MAX_TABULAR_INSIGHT_PAGES,
  pageLooksLikeTabularEvidence,
  selectTabularEvidencePages,
  tabularEvidenceScore,
} from "./tabular-evidence";

const FILLER = Array.from(
  { length: 12 },
  (_, index) => `slice 0 line ${index} of verification evidence`
).join("\n");

const URS_OPERATING_TABLE = [
  ...Array.from(
    { length: 8 },
    (_, index) => `URS requirement line ${index} of verification evidence`
  ),
  "URS-3 Shell Operating temperature 15 °C to 130 °C",
  "URS-4 Shell Operating pressure Full Vacuum to 3.5 Kg/cm²",
  "URS-5 Jacket Operating Temperature 15 °C to 130 °C",
].join("\n");

const DV_REQUIREMENT_MATRIX = Array.from(
  { length: 8 },
  (_, index) => `SW-PA-${index + 1} Pattern requirement Pass Fail comments`
).join("\n");

describe("pageLooksLikeTabularEvidence", () => {
  it("treats a URS operating-range table as tabular", () => {
    expect(pageLooksLikeTabularEvidence(URS_OPERATING_TABLE)).toBe(true);
    expect(tabularEvidenceScore(URS_OPERATING_TABLE)).toBeGreaterThanOrEqual(6);
  });

  it("treats a DV requirement matrix as tabular without a Celsius range", () => {
    expect(pageLooksLikeTabularEvidence(DV_REQUIREMENT_MATRIX)).toBe(true);
  });

  it("does not treat filler verification prose as tabular", () => {
    expect(pageLooksLikeTabularEvidence(FILLER)).toBe(false);
  });

  it("does not treat a single SOP citation in a paragraph as tabular", () => {
    expect(
      pageLooksLikeTabularEvidence(
        "The batch was manufactured according to SOP/DP/QA/014. Review the protocol before filling the summary."
      )
    ).toBe(false);
  });

  it("does not treat a genuine en-dash range in a sentence as tabular", () => {
    expect(
      pageLooksLikeTabularEvidence(
        "Process temperature 15–130 °C was used for the hold."
      )
    ).toBe(false);
  });
});

describe("selectTabularEvidencePages", () => {
  it("picks URS table pages and skips filler", () => {
    const selected = selectTabularEvidencePages([
      { pageNumber: 1, text: FILLER },
      { pageNumber: 6, text: URS_OPERATING_TABLE },
      { pageNumber: 9, text: "URS-37 Temperature 20 °C to 150 °C\n" + FILLER },
      { pageNumber: 12, text: FILLER },
    ]);
    expect(selected.map((page) => page.pageNumber)).toEqual([6, 9]);
  });

  it("caps at MAX_TABULAR_INSIGHT_PAGES", () => {
    const pages = Array.from({ length: 8 }, (_, index) => ({
      pageNumber: index + 1,
      text: DV_REQUIREMENT_MATRIX,
    }));
    const selected = selectTabularEvidencePages(pages);
    expect(selected).toHaveLength(MAX_TABULAR_INSIGHT_PAGES);
    expect(selected.map((page) => page.pageNumber)).toEqual([1, 2, 3, 4, 5]);
  });
});
