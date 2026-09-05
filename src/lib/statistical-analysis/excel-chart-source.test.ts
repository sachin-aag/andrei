import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { DEFAULT_CHART_LAYOUT } from "@/lib/charts/chart-spec";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import { buildAnalysisChartSource } from "./excel-chart-source";
import {
  CAPABILITY_SIXPACK_NORMAL,
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
    expect(hist?.headers).toEqual([
      "X",
      "Count",
      "Overall",
      "Within",
      "LSL",
      "USL",
    ]);
    expect(hist?.rows.length).toBe(outcome.result.histogram.overallCurve.length);
    expect(hist?.rows.length).toBeGreaterThan(
      outcome.result.histogram.bins.length
    );
    const overallCol = hist?.rows.map((row) => row[2]) ?? [];
    expect(overallCol.every((value) => typeof value === "number")).toBe(true);
    const histogramChart = source.charts.find((chart) =>
      chart.title.includes("Capability Histogram")
    );
    expect(histogramChart?.kind).toBe("columnLine");
    expect(histogramChart?.gapWidth).toBe(0);
    expect(
      histogramChart?.series.some(
        (series) => series.name === "Overall" && series.asLine && series.smooth
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
});
