import { describe, expect, it } from "vitest";
import { erf, stdNormCdf, stdNormInv } from "./normal";
import { andersonDarlingPValue } from "./sixpack";

describe("normal distribution helpers", () => {
  it("evaluates erf at known points", () => {
    expect(erf(0)).toBeCloseTo(0, 10);
    expect(erf(1)).toBeCloseTo(0.8427007929, 5);
    expect(erf(-1)).toBeCloseTo(-0.8427007929, 5);
  });

  it("matches standard normal CDF anchors", () => {
    expect(stdNormCdf(0)).toBeCloseTo(0.5, 7);
    expect(stdNormCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(stdNormCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("inverts the standard normal CDF", () => {
    expect(stdNormInv(0.5)).toBeCloseTo(0, 10);
    expect(stdNormInv(0.975)).toBeCloseTo(1.96, 3);
    expect(stdNormInv(0.025)).toBeCloseTo(-1.96, 3);
    expect(stdNormCdf(stdNormInv(0.91))).toBeCloseTo(0.91, 5);
  });
});

describe("Anderson-Darling p-value approximation", () => {
  it("stays inside (0, 1] for typical AD* values", () => {
    expect(andersonDarlingPValue(0.15)).toBeGreaterThan(0.5);
    expect(andersonDarlingPValue(0.25)).toBeGreaterThan(0.2);
    expect(andersonDarlingPValue(0.8)).toBeLessThan(0.05);
    expect(andersonDarlingPValue(2)).toBeLessThan(0.001);
  });
});
