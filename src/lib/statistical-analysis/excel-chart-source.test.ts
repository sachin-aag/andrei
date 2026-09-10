import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { DEFAULT_CHART_LAYOUT } from "@/lib/charts/chart-spec";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import { computeHistogramFromValues } from "./histogram";
import { buildAnalysisChartSource } from "./excel-chart-source";
import {
  CAPABILITY_SIXPACK_NORMAL,
  HISTOGRAM,
  MEASUREMENT_SCATTER,
  type StatisticalAnalysisSummary,
} from "./types";

describe("buildAnalysisChartSource", () => {
  it("builds I-chart and scatter source tables", () => {
    const outcome = computeCapabilitySixpackFromValues(
      [10, 12, 11, 13, 14, 11, 12, 13],
      0,
      {
        columnId: "c1",
        columnName: "Assay",
        title: "Assay",
        lsl: 8,
        usl: 16,
        target: 12,
      }
    );
    if (!outcome.ok) throw new Error(outcome.message);
    const sixpack: StatisticalAnalysisSummary = {
      id: "an-1",
      workspaceId: "ws-1",
      kind: CAPABILITY_SIXPACK_NORMAL,
      title: "Assay sixpack",
      config: {
        columnId: "c1",
        columnName: "Assay",
        title: "Assay sixpack",
        lsl: 8,
        usl: 16,
        target: 12,
      },
      results: outcome.result,
      sourceHash: "abc",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const source = buildAnalysisChartSource(sixpack);
    expect(source.tables.some((table) => table.id === "i-chart")).toBe(true);
    expect(source.charts.some((chart) => chart.kind === "line")).toBe(true);
    expect(source.charts.some((chart) => chart.title.includes("I Chart"))).toBe(
      true
    );
    const iTable = source.tables.find((table) => table.id === "i-chart");
    expect(typeof iTable?.rows[0]?.[1]).toBe("number");
    const hist = source.tables.find((table) => table.id === "capability-hist");
    expect(hist?.headers).toEqual(["Midpoint", "Count"]);
    expect(hist?.rows.length).toBeGreaterThanOrEqual(
      outcome.result.histogram.bins.length
    );
    expect(hist?.rows.length).toBeLessThan(
      outcome.result.histogram.overallCurve.length
    );
    const counts = hist?.rows.map((row) => row[1]) ?? [];
    expect(counts.every((value) => typeof value === "number")).toBe(true);
    const binCounts = outcome.result.histogram.bins.map((bin) => bin.count);
    expect(counts.filter((value) => value !== 0)).toEqual(binCounts);
    const fit = source.tables.find((table) => table.id === "capability-hist-fit");
    expect(fit?.rows.length).toBe(outcome.result.histogram.overallCurve.length);
    const lsl = source.tables.find((table) => table.id === "capability-hist-lsl");
    const usl = source.tables.find((table) => table.id === "capability-hist-usl");
    expect(lsl?.rows).toEqual([
      [8, 0],
      [8, source.charts.find((chart) => chart.title.includes("Histogram"))?.yMax],
    ]);
    expect(usl?.rows[0]?.[0]).toBe(16);
    expect(usl?.rows[1]?.[0]).toBe(16);
    expect(usl?.rows[0]?.[1]).toBe(0);
    expect(usl?.rows[1]?.[1]).toBe(lsl?.rows[1]?.[1]);
    const histogramChart = source.charts.find((chart) =>
      chart.title.includes("Capability Histogram")
    );
    expect(histogramChart?.kind).toBe("columnScatter");
    expect(histogramChart?.gapWidth).toBe(0);
    expect(histogramChart?.overlap).toBe(100);
    expect(histogramChart?.xMin).toBeLessThan(8);
    expect(histogramChart?.xMax).toBeGreaterThan(16);
    expect(
      histogramChart?.series.some(
        (series) =>
          series.name === "Overall" && series.asScatter && series.smooth
      )
    ).toBe(true);
    expect(
      histogramChart?.series.some(
        (series) => series.name === "LSL" && series.asScatter
      )
    ).toBe(true);
  });

  it("builds a scatter chart for measurement plots", () => {
    const analysis: StatisticalAnalysisSummary = {
      id: "an-2",
      workspaceId: "ws-1",
      kind: MEASUREMENT_SCATTER,
      title: "Torque scatter",
      config: {
        query: "torque",
        title: "Torque scatter",
        xLabel: "Index",
        yLabel: "Torque",
        layout: { ...DEFAULT_CHART_LAYOUT, seriesBy: "none" },
        lsl: null,
        usl: null,
      },
      results: {
        specs: [TORQUE_MOCK_SPEC],
        n: TORQUE_MOCK_SPEC.points.length,
        uom: TORQUE_MOCK_SPEC.uom,
      },
      sourceHash: "def",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const source = buildAnalysisChartSource(analysis);
    expect(source.charts).toHaveLength(1);
    expect(source.charts[0]?.kind).toBe("scatter");
    expect(source.tables[0]?.rows[0]?.[0]).toBe(1);
    expect(source.tables[0]?.rows[0]?.[1]).toBe(TORQUE_MOCK_SPEC.points[0]?.y);
  });

  it("fuses histogram bars and draws vertical LSL/USL at the spec values", () => {
    const outcome = computeHistogramFromValues(
      [10, 12, 11, 13, 14, 11, 12, 13],
      0,
      {
        columnId: "c1",
        columnName: "Assay",
        title: "Assay histogram",
        lsl: 8,
        usl: 16,
      }
    );
    if (!outcome.ok) throw new Error(outcome.message);
    const analysis: StatisticalAnalysisSummary = {
      id: "an-3",
      workspaceId: "ws-1",
      kind: HISTOGRAM,
      title: "Assay histogram",
      config: {
        columnId: "c1",
        columnName: "Assay",
        title: "Assay histogram",
        lsl: 8,
        usl: 16,
      },
      results: outcome.result,
      sourceHash: "ghi",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const source = buildAnalysisChartSource(analysis);
    const bars = source.tables.find((table) => table.id === "histogram");
    const fit = source.tables.find((table) => table.id === "histogram-fit");
    const lsl = source.tables.find((table) => table.id === "histogram-lsl");
    const usl = source.tables.find((table) => table.id === "histogram-usl");
    expect(bars?.headers).toEqual(["Midpoint", "Count"]);
    expect(bars?.rows.length).toBeGreaterThanOrEqual(
      outcome.result.histogram.bins.length
    );
    expect(fit?.rows.length).toBe(outcome.result.histogram.overallCurve.length);
    expect(lsl?.rows.map((row) => row[0])).toEqual([8, 8]);
    expect(usl?.rows.map((row) => row[0])).toEqual([16, 16]);
    const chart = source.charts[0];
    expect(chart?.kind).toBe("columnScatter");
    expect(chart?.gapWidth).toBe(0);
    expect(chart?.overlap).toBe(100);
    expect(chart?.series.filter((item) => item.asScatter).map((item) => item.name)).toEqual(
      ["Overall", "Within", "LSL", "USL"]
    );
  });
});
