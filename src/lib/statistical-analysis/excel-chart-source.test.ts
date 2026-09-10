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
    expect(hist?.headers).toEqual([
      "X",
      "Count",
      "Overall",
      "Within",
      "LSL",
      "USL",
    ]);
    expect(hist?.rows.length).toBeGreaterThan(
      outcome.result.histogram.overallCurve.length
    );
    const counts = hist?.rows.map((row) => row[1]) ?? [];
    expect(counts.every((value) => typeof value === "number")).toBe(true);
    const xs = hist?.rows.map((row) => row[0]) ?? [];
    expect(xs.filter((value) => value === 8)).toEqual([8, 8]);
    expect(xs.filter((value) => value === 16)).toEqual([16, 16]);
    const lslCol = hist?.rows.map((row) => row[4]) ?? [];
    const uslCol = hist?.rows.map((row) => row[5]) ?? [];
    const lslAtSpec = lslCol.filter(
      (_, i) => xs[i] === 8 && typeof lslCol[i] === "number"
    );
    const uslAtSpec = uslCol.filter(
      (_, i) => xs[i] === 16 && typeof uslCol[i] === "number"
    );
    expect(lslAtSpec).toEqual([0, expect.any(Number)]);
    expect(uslAtSpec).toEqual([0, expect.any(Number)]);
    expect(lslAtSpec[1]).toBeGreaterThan(0);
    expect(uslAtSpec[1]).toBeGreaterThan(0);
    const overallCol = hist?.rows.map((row) => row[2]) ?? [];
    expect(overallCol.every((value) => typeof value === "number")).toBe(true);
    const histogramChart = source.charts.find((chart) =>
      chart.title.includes("Capability Histogram")
    );
    expect(histogramChart?.kind).toBe("columnLine");
    expect(histogramChart?.gapWidth).toBe(0);
    expect(histogramChart?.overlap).toBe(100);
    expect(histogramChart?.forceCategoryAxis).toBe(true);
    expect(histogramChart?.categoryAsText).toBe(true);
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
    const table = source.tables[0];
    expect(table?.headers).toEqual([
      "X",
      "Count",
      "Overall",
      "Within",
      "LSL",
      "USL",
    ]);
    const xs = table?.rows.map((row) => row[0] as number) ?? [];
    const counts = table?.rows.map((row) => row[1] as number) ?? [];
    expect(counts.every((value) => Number.isFinite(value))).toBe(true);
    const bins = outcome.result.histogram.bins;
    for (const bin of bins) {
      const last = bins[bins.length - 1];
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i]!;
        const inside =
          x >= bin.x0 && (x < bin.x1 || (bin === last && x === bin.x1));
        if (inside) expect(counts[i]).toBe(bin.count);
      }
    }
    const chart = source.charts[0];
    expect(chart?.gapWidth).toBe(0);
    expect(chart?.overlap).toBe(100);
    const lslIdx = xs.flatMap((x, i) => (x === 8 ? [i] : []));
    expect(lslIdx).toHaveLength(2);
    expect(lslIdx[1]).toBe((lslIdx[0] ?? 0) + 1);
    expect(table?.rows[lslIdx[0]!]![4]).toBe(0);
    expect(table?.rows[lslIdx[1]!]![4]).toBe(chart?.yMax);
  });
});
