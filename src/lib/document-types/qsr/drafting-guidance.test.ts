import { describe, expect, it } from "vitest";
import { QSR_DRAFTING_GUIDANCE } from "./drafting-guidance";

describe("QSR_DRAFTING_GUIDANCE", () => {
  it("fills four protocol family columns and keys RTM inserts", () => {
    expect(QSR_DRAFTING_GUIDANCE).toContain("four family columns");
    expect(QSR_DRAFTING_GUIDANCE).toContain("Prefer afterRowKey");
    expect(QSR_DRAFTING_GUIDANCE).not.toContain("PQ, then OQ, then IQ, then DQ");
  });

  it("pairs protocol and report rows and forbids invented lifecycle types", () => {
    expect(QSR_DRAFTING_GUIDANCE).toContain("Qualification Documents (Table 3)");
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "URS, DS, FMEA, DQ, FAT, SAT, IQ, OQ, PQ"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain("do not invent FMEA, FAT, or SAT");
  });
});
