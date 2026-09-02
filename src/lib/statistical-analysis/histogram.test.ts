import { describe, expect, it } from "vitest";
import { SAMPLE_ASSAY_VALUES } from "./sample-data";
import {
  computeHistogram,
  computeHistogramFromValues,
  histogramLimitsFromColumnSpecs,
  mergeHistogramPatch,
} from "./histogram";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import {
  createEmptyWorksheet,
  replaceColumnValues,
  upsertSpecRow,
} from "./worksheet";

const ASSAY = [...SAMPLE_ASSAY_VALUES];

const config = {
  columnId: "c1",
  columnName: "Assay",
  title: "Histogram of Assay",
  lsl: 90,
  usl: 110,
};

describe("computeHistogramFromValues", () => {
  it("uses the same bins and curves as the sixpack histogram", () => {
    const sixpack = computeCapabilitySixpackFromValues(ASSAY, 0, {
      ...config,
      target: 100,
    });
    const histogram = computeHistogramFromValues(ASSAY, 0, config);
    expect(sixpack.ok).toBe(true);
    expect(histogram.ok).toBe(true);
    if (!sixpack.ok || !histogram.ok) return;
    expect(histogram.result.histogram).toEqual(sixpack.result.histogram);
    expect(histogram.result.mean).toBe(sixpack.result.mean);
    expect(histogram.result.overallStdev).toBe(sixpack.result.overallStdev);
    expect(histogram.result.withinStdev).toBe(sixpack.result.withinStdev);
  });

  it("allows a histogram without spec limits", () => {
    const outcome = computeHistogramFromValues(ASSAY, 0, {
      ...config,
      lsl: null,
      usl: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(ASSAY.length);
    expect(outcome.result.histogram.bins.length).toBeGreaterThan(0);
  });

  it("rejects inverted spec limits", () => {
    const outcome = computeHistogramFromValues(ASSAY, 0, {
      ...config,
      lsl: 110,
      usl: 90,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("invalid_specs");
  });

  it("draws one bar for a single observation", () => {
    const outcome = computeHistogramFromValues([101.2], 0, {
      ...config,
      lsl: null,
      usl: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(1);
    expect(outcome.result.histogram.bins.some((bin) => bin.count === 1)).toBe(
      true
    );
  });
});

describe("computeHistogram", () => {
  it("reads numeric values from the worksheet column", () => {
    let worksheet = createEmptyWorksheet();
    worksheet = replaceColumnValues(worksheet, 0, ASSAY.map(String));
    const outcome = computeHistogram(worksheet, config);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(ASSAY.length);
  });
});

describe("histogramLimitsFromColumnSpecs", () => {
  it("reads named LSL/USL and does not invent min/max", () => {
    let worksheet = createEmptyWorksheet();
    worksheet = replaceColumnValues(
      worksheet,
      0,
      ASSAY.map(String)
    );
    expect(histogramLimitsFromColumnSpecs(worksheet, "C1")).toEqual({
      lsl: null,
      usl: null,
    });
    worksheet = upsertSpecRow(worksheet, {
      columnName: "C1",
      lsl: "90",
      usl: "110",
      target: "100",
    });
    expect(histogramLimitsFromColumnSpecs(worksheet, "C1")).toEqual({
      lsl: 90,
      usl: 110,
    });
  });
});

describe("mergeHistogramPatch", () => {
  it("keeps overlay defaults on and applies checkbox patches", () => {
    const existing = {
      ...config,
      showDistributionLines: true,
      showLsl: true,
      showUsl: true,
    };
    const merged = mergeHistogramPatch(existing, {
      showDistributionLines: false,
      showUsl: false,
    });
    expect(merged.showDistributionLines).toBe(false);
    expect(merged.showLsl).toBe(true);
    expect(merged.showUsl).toBe(false);
    expect(merged.lsl).toBe(90);
  });
});
