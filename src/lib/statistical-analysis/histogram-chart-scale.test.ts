import { describe, expect, it } from "vitest";
import { histogramChartScale } from "./histogram-chart-scale";
import { computeHistogramFromValues } from "./histogram";
import { SAMPLE_ASSAY_VALUES } from "./sample-data";

describe("histogramChartScale", () => {
  it("uses more than endpoint labels on a wide measurement range", () => {
    const values = [10, 12, 11, 13, 14, 12, 11, 9, 15, 70];
    const outcome = computeHistogramFromValues(values, 0, {
      columnId: "c1",
      columnName: "Measurement",
      title: "Histogram",
      lsl: 14,
      usl: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const scale = histogramChartScale({
      bins: outcome.result.histogram.bins,
      overallCurve: outcome.result.histogram.overallCurve,
      withinCurve: outcome.result.histogram.withinCurve,
      lsl: 14,
      usl: null,
    });
    expect(scale.xTicks.length).toBeGreaterThan(2);
    expect(scale.yTicks.length).toBeGreaterThan(2);
    expect(scale.xTicks[0]).toBe(scale.xMin);
    expect(scale.xTicks[scale.xTicks.length - 1]).toBe(scale.xMax);
    expect(scale.yMin).toBe(0);
  });

  it("keeps assay sixpack specs inside a nice x domain", () => {
    const outcome = computeHistogramFromValues([...SAMPLE_ASSAY_VALUES], 0, {
      columnId: "c1",
      columnName: "Assay",
      title: "Histogram of Assay",
      lsl: 90,
      usl: 110,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const scale = histogramChartScale({
      bins: outcome.result.histogram.bins,
      overallCurve: outcome.result.histogram.overallCurve,
      withinCurve: outcome.result.histogram.withinCurve,
      lsl: 90,
      usl: 110,
    });
    expect(scale.xMin).toBeLessThanOrEqual(90);
    expect(scale.xMax).toBeGreaterThanOrEqual(110);
    expect(scale.xTicks.length).toBeGreaterThan(2);
  });
});
