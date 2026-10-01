import { describe, expect, it } from "vitest";
import { findDirectedContradictions } from "./contradictions";

describe("findDirectedContradictions", () => {
  it("flags a source fact the target text denies", () => {
    expect(
      findDirectedContradictions("Result: OOT", "All instruments remain within calibration", [
        {
          when: /\boot\b|out of tolerance/i,
          contradicts: /within calibration|in tolerance|valid/i,
          message: "OOT vs within calibration",
        },
      ])
    ).toEqual(["OOT vs within calibration"]);
  });

  it("does not fire when only one side matches", () => {
    expect(
      findDirectedContradictions("Result: Pass", "Instruments remain within calibration", [
        {
          when: /\boot\b/i,
          contradicts: /within calibration/i,
          message: "OOT vs within calibration",
        },
      ])
    ).toEqual([]);
  });
});
