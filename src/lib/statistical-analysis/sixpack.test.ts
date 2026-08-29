import { describe, expect, it } from "vitest";
import { SAMPLE_ASSAY_VALUES } from "./sample-data";
import {
  computeCapabilitySixpack,
  computeCapabilitySixpackFromValues,
  meanOf,
  movingRanges,
  sampleStdev,
} from "./sixpack";
import { createEmptyWorksheet, pasteTsv } from "./worksheet";

const SMALL = [10, 12, 11, 13, 14];

describe("capability sixpack (normal, individuals)", () => {
  it("matches hand-calculated I-MR limits and capability for a small sample", () => {
    const mean = meanOf(SMALL);
    const sd = sampleStdev(SMALL, mean);
    expect(mean).toBeCloseTo(12, 10);
    expect(sd).toBeCloseTo(Math.sqrt(2.5), 10);
    expect(movingRanges(SMALL)).toEqual([2, 1, 2, 1]);

    const outcome = computeCapabilitySixpackFromValues(SMALL, 0, {
      columnId: "c1",
      columnName: "C1",
      title: "C1",
      lsl: 8,
      usl: 16,
      target: 12,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { result } = outcome;
    expect(result.mrBar).toBeCloseTo(1.5, 10);
    expect(result.withinStdev).toBeCloseTo(1.5 / 1.128, 8);
    expect(result.individuals.center).toBeCloseTo(12, 10);
    expect(result.individuals.ucl).toBeCloseTo(12 + 2.66 * 1.5, 8);
    expect(result.individuals.lcl).toBeCloseTo(12 - 2.66 * 1.5, 8);
    expect(result.movingRange.ucl).toBeCloseTo(3.267 * 1.5, 8);
    expect(result.movingRange.lcl).toBe(0);
    expect(result.individuals.outOfControl).toEqual([]);
    expect(result.capability.cp).toBeCloseTo(8 / (6 * (1.5 / 1.128)), 6);
    expect(result.capability.cpk).toBeCloseTo(result.capability.cp ?? 0, 8);
    expect(result.capability.pp).toBeCloseTo(8 / (6 * sd), 6);
    expect(result.lastObservations).toEqual(SMALL);
    expect(result.normalPlot.pValue).toBeGreaterThan(0.1);
  });

  it("flags points beyond the individuals control limits", () => {
    const outcome = computeCapabilitySixpackFromValues(
      [10, 10.2, 9.8, 10.1, 25],
      0,
      { columnId: "c1", columnName: "C1", title: "C1", lsl: 0, usl: 30, target: null }
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.individuals.outOfControl).toContain(4);
  });

  it("computes a plausible sixpack for the sample assay column", () => {
    const outcome = computeCapabilitySixpackFromValues(
      [...SAMPLE_ASSAY_VALUES],
      0,
      {
        columnId: "c1",
        columnName: "Assay",
        title: "Assay",
        lsl: 90,
        usl: 110,
        target: 100,
      }
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(50);
    expect(outcome.result.mean).toBeGreaterThan(100);
    expect(outcome.result.mean).toBeLessThan(104);
    expect(outcome.result.capability.cp).not.toBeNull();
    expect(outcome.result.capability.cpk).not.toBeNull();
    expect(outcome.result.capability.pp).not.toBeNull();
    expect((outcome.result.capability.cp ?? 0) > 1).toBe(true);
    expect(outcome.result.histogram.bins.some((bin) => bin.count > 0)).toBe(
      true
    );
    expect(outcome.result.normalPlot.points).toHaveLength(50);
  });

  it("reads a row range from the selected worksheet column", () => {
    let sheet = createEmptyWorksheet(1);
    sheet = pasteTsv(sheet, 0, 0, ["1", "2", ...SMALL, "99"].join("\n"));
    const outcome = computeCapabilitySixpack(sheet, {
      columnId: "c1",
      columnName: "C1",
      title: "C1",
      lsl: 8,
      usl: 16,
      target: null,
      rowStart: 3,
      rowEnd: 7,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(5);
    expect(outcome.result.mean).toBeCloseTo(12, 10);
  });

  it("reads the selected worksheet column", () => {
    let sheet = createEmptyWorksheet(1);
    sheet = pasteTsv(sheet, 0, 0, SMALL.join("\n"));
    const outcome = computeCapabilitySixpack(sheet, {
      columnId: "c1",
      columnName: "C1",
      title: "C1",
      lsl: 8,
      usl: 16,
      target: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(5);
  });

  it("rejects missing specs, inverted specs, and too little data", () => {
    expect(
      computeCapabilitySixpackFromValues(SMALL, 0, {
        columnId: "c1",
        columnName: "C1",
        title: "C1",
        lsl: null,
        usl: null,
        target: null,
      }).ok
    ).toBe(false);
    expect(
      computeCapabilitySixpackFromValues(SMALL, 0, {
        columnId: "c1",
        columnName: "C1",
        title: "C1",
        lsl: 16,
        usl: 8,
        target: null,
      }).ok
    ).toBe(false);
    const tooFew = computeCapabilitySixpackFromValues([1], 0, {
      columnId: "c1",
      columnName: "C1",
      title: "C1",
      lsl: 0,
      usl: 2,
      target: null,
    });
    expect(tooFew.ok).toBe(false);
    if (!tooFew.ok) expect(tooFew.code).toBe("too_few_values");
    const zeroVar = computeCapabilitySixpackFromValues([5, 5, 5], 0, {
      columnId: "c1",
      columnName: "C1",
      title: "C1",
      lsl: 0,
      usl: 10,
      target: null,
    });
    expect(zeroVar.ok).toBe(false);
    if (!zeroVar.ok) expect(zeroVar.code).toBe("zero_variance");
  });

  it("gives a low normality p-value for strongly skewed data", () => {
    const skewed = Array.from({ length: 40 }, (_, i) => Math.exp(i / 8));
    const outcome = computeCapabilitySixpackFromValues(skewed, 0, {
      columnId: "c1",
      columnName: "C1",
      title: "C1",
      lsl: 0,
      usl: 200,
      target: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.normalPlot.pValue).toBeLessThan(0.05);
  });
});
