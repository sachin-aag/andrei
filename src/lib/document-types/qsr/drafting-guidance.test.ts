import { describe, expect, it } from "vitest";
import { QSR_DRAFTING_GUIDANCE } from "./drafting-guidance";

describe("QSR_DRAFTING_GUIDANCE", () => {
  it("pairs protocol and report rows and forbids invented lifecycle types", () => {
    expect(QSR_DRAFTING_GUIDANCE).toContain("Qualification Documents (Table 3)");
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "URS, DS, FMEA, DQ, FAT, SAT, IQ, OQ, PQ"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain("do not invent FMEA, FAT, or SAT");
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "leaves Document Name, Revision, and Remarks empty"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Do not insert a second fully filled report row"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain("Approved / Complies / Closed");
  });
});
