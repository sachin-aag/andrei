import { describe, expect, it } from "vitest";
import {
  chartShowsMeanLine,
  finiteMean,
  meanLineGroups,
  scatterJitterPxByIndex,
} from "./mean-line";

describe("chartShowsMeanLine", () => {
  it("is off unless explicitly true", () => {
    expect(chartShowsMeanLine({})).toBe(false);
    expect(chartShowsMeanLine({ showMeanLine: false })).toBe(false);
    expect(chartShowsMeanLine({ showMeanLine: true })).toBe(true);
  });
});

describe("meanLineGroups", () => {
  it("averages Y at each shared X", () => {
    const groups = meanLineGroups([
      { x: 1, y: 10, series: null },
      { x: 1, y: 14, series: null },
      { x: 2, y: 20, series: null },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.series).toBeNull();
    expect(groups[0]?.points).toEqual([
      { x: 1, y: 12, series: null, n: 2 },
      { x: 2, y: 20, series: null, n: 1 },
    ]);
  });

  it("sorts means by X even when points arrive out of order", () => {
    const groups = meanLineGroups([
      { x: 3, y: 1, series: null },
      { x: 1, y: 2, series: null },
      { x: 2, y: 3, series: null },
    ]);
    expect(groups[0]?.points.map((point) => point.x)).toEqual([1, 2, 3]);
  });

  it("draws one mean line per legend series", () => {
    const groups = meanLineGroups(
      [
        { x: 1, y: 10, series: "A" },
        { x: 1, y: 20, series: "B" },
        { x: 2, y: 12, series: "A" },
        { x: 2, y: 22, series: "B" },
      ],
      "unit"
    );
    expect(groups.map((group) => group.series)).toEqual(["A", "B"]);
    expect(groups[0]?.points.map((point) => point.y)).toEqual([10, 12]);
    expect(groups[1]?.points.map((point) => point.y)).toEqual([20, 22]);
  });

  it("collapses legend series into one line when seriesBy is none", () => {
    const groups = meanLineGroups(
      [
        { x: 1, y: 10, series: "A" },
        { x: 1, y: 20, series: "B" },
      ],
      "none"
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.points).toEqual([{ x: 1, y: 15, series: null, n: 2 }]);
  });
});

describe("scatterJitterPxByIndex", () => {
  it("leaves unique X values unshifted", () => {
    expect(scatterJitterPxByIndex([{ x: 1 }, { x: 2 }, { x: 3 }], 8)).toEqual([
      0, 0, 0,
    ]);
  });

  it("fans overlapping X across ±maxPx", () => {
    expect(scatterJitterPxByIndex([{ x: 1 }, { x: 1 }, { x: 1 }], 8)).toEqual([
      -8, 0, 8,
    ]);
  });
});

describe("finiteMean", () => {
  it("drops missing and non-finite values", () => {
    expect(finiteMean(12.5)).toBe(12.5);
    expect(finiteMean(null)).toBeNull();
    expect(finiteMean(Number.NaN)).toBeNull();
    expect(finiteMean(undefined)).toBeNull();
  });
});
