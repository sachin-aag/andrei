import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import {
  CONTROL_CHART_AXIS_PAD,
  paddedDomain,
} from "@/lib/charts/axis-domain";
import { DEFAULT_CHART_LAYOUT, resolveYRange } from "@/lib/charts/chart-spec";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import { computeHistogramFromValues } from "./histogram";
import {
  buildAnalysisChartSource,
  resolvePlannedCharts,
} from "./excel-chart-source";
import { chartBrandColors } from "@/lib/charts/brand-colors";
import { resolveCustomerId } from "@/lib/customers/resolve";
import {
  BOXPLOT_EXCEL_SPACER,
  boxplotExcelLayout,
} from "./boxplot-chart-layout";
import {
  BOXPLOT,
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

describe("exported charts frame data like the on-screen panels", () => {
  function sixpackAnalysis(): StatisticalAnalysisSummary {
    const outcome = computeCapabilitySixpackFromValues(
      [10, 12, 11, 13, 14, 11, 12, 13, 10, 12],
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
    return {
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
  }

  it("gives the I chart the same padded window as the SVG panel", () => {
    const analysis = sixpackAnalysis();
    if (analysis.kind !== CAPABILITY_SIXPACK_NORMAL) throw new Error("kind");
    const { individuals } = analysis.results;
    const [expectedMin, expectedMax] = paddedDomain(
      [
        ...individuals.values,
        individuals.center,
        individuals.ucl,
        individuals.lcl,
        8,
        16,
      ],
      CONTROL_CHART_AXIS_PAD
    );
    const chart = buildAnalysisChartSource(analysis).charts.find((item) =>
      item.title.includes("I Chart")
    );
    expect(chart?.yMin).toBeCloseTo(expectedMin, 10);
    expect(chart?.yMax).toBeCloseTo(expectedMax, 10);
    expect(chart?.yMajorUnit).toBeCloseTo((expectedMax - expectedMin) / 2, 10);
  });

  it("frames every sixpack panel instead of letting Excel auto-scale", () => {
    const charts = buildAnalysisChartSource(sixpackAnalysis()).charts;
    expect(charts.length).toBeGreaterThan(0);
    for (const chart of charts) {
      expect(typeof chart.yMin).toBe("number");
      expect(typeof chart.yMax).toBe("number");
      expect(chart.yMajorUnit).toBeGreaterThan(0);
    }
  });

  it("frames scatter charts from the shared spec ranges", () => {
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
      sourceHash: "abc",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const chart = buildAnalysisChartSource(analysis).charts[0];
    const expectedY = resolveYRange(TORQUE_MOCK_SPEC);
    expect(chart?.yMin).toBeCloseTo(expectedY.min, 10);
    expect(chart?.yMax).toBeCloseTo(expectedY.max, 10);
    expect(chart?.xMajorUnit).toBeGreaterThan(0);
  });
});

describe("sixpack panels line up with the worksheet run", () => {
  function sixpack(values: number[]): StatisticalAnalysisSummary {
    const outcome = computeCapabilitySixpackFromValues(values, 0, {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay",
      lsl: 8,
      usl: 16,
      target: 12,
    });
    if (!outcome.ok) throw new Error(outcome.message);
    return {
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
  }

  it("numbers moving ranges from the second observation of each pair", () => {
    const source = buildAnalysisChartSource(
      sixpack([10, 12, 11, 13, 14, 11, 12, 13])
    );
    const table = source.tables.find((item) => item.id === "mr-chart");
    expect(table?.rows[0]?.[0]).toBe(2);
    expect(table?.rows.at(-1)?.[0]).toBe(8);
  });

  it("carries the centre line and spec limits onto the last-25 panel", () => {
    const values = Array.from({ length: 30 }, (_, i) => 10 + (i % 5));
    const source = buildAnalysisChartSource(sixpack(values));
    const chart = source.charts.find((item) =>
      item.title.includes("Last 25")
    );
    expect(chart?.series.map((item) => item.name)).toEqual([
      "Value",
      "CL",
      "LSL",
      "USL",
    ]);
    const table = source.tables.find((item) => item.id === "last-25");
    expect(table?.rows[0]?.[0]).toBe(6);
    expect(table?.rows.at(-1)?.[0]).toBe(30);
  });
});

describe("resolvePlannedCharts", () => {
  it("packs anchors so a chart with no data leaves no hole", () => {
    const written = new Map([
      [
        "t2",
        {
          dataStart: 2,
          dataEnd: 3,
          headers: ["X", "Y"],
          rows: [
            [1, 10],
            [2, 20],
          ] as Array<Array<string | number | null>>,
        },
      ],
    ]);
    const charts = resolvePlannedCharts(
      "Sheet1",
      [
        {
          title: "dropped",
          kind: "line",
          series: [{ name: "A", tableId: "missing", catCol: 0, valCol: 1, color: "#001838" }],
        },
        {
          title: "kept",
          kind: "line",
          series: [{ name: "B", tableId: "t2", catCol: 0, valCol: 1, color: "#001838" }],
        },
      ],
      written
    );
    expect(charts).toHaveLength(1);
    expect(charts[0]?.title).toBe("kept");
    expect(charts[0]?.anchorRow).toBe(1);
    expect(charts[0]?.anchorCol).toBe(0);
  });
});

describe("exported series match the on-screen styling", () => {
  it("draws histogram bars as a light fill with a border", () => {
    const outcome = computeHistogramFromValues([1, 2, 2, 3, 3, 3, 4, 5], 0, {
      columnId: "c1",
      columnName: "Assay",
      title: "Histogram of Assay",
      lsl: null,
      usl: null,
    });
    if (!outcome.ok) throw new Error(outcome.message);
    const analysis: StatisticalAnalysisSummary = {
      id: "an-3",
      workspaceId: "ws-1",
      kind: HISTOGRAM,
      title: "Histogram of Assay",
      config: {
        columnId: "c1",
        columnName: "Assay",
        title: "Histogram of Assay",
        lsl: null,
        usl: null,
      },
      results: outcome.result,
      sourceHash: "abc",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const colors = chartBrandColors(resolveCustomerId());
    const chart = buildAnalysisChartSource(analysis).charts[0];
    const bars = chart?.series.find((item) => item.name === "Count");
    expect(bars?.color).toBe(colors.brand200);
    expect(bars?.borderColor).toBe(colors.brand500);
    const overall = chart?.series.find((item) => item.name === "Overall");
    expect(overall?.color).toBe(colors.axis);
  });

  it("keeps the control-chart connecting line darker than its markers", () => {
    const outcome = computeCapabilitySixpackFromValues(
      [10, 12, 11, 13, 14, 11, 12, 13],
      0,
      { columnId: "c1", columnName: "Assay", title: "Assay", lsl: 8, usl: 16, target: 12 }
    );
    if (!outcome.ok) throw new Error(outcome.message);
    const colors = chartBrandColors(resolveCustomerId());
    const source = buildAnalysisChartSource({
      id: "an-1",
      workspaceId: "ws-1",
      kind: CAPABILITY_SIXPACK_NORMAL,
      title: "Assay sixpack",
      config: { columnId: "c1", columnName: "Assay", title: "Assay sixpack", lsl: 8, usl: 16, target: 12 },
      results: outcome.result,
      sourceHash: "abc",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    });
    const value = source.charts
      .find((chart) => chart.title.includes("I Chart"))
      ?.series.find((item) => item.name === "Value");
    expect(value?.color).toBe(colors.brand600);
    expect(value?.lineColor).toBe(colors.foreground);
  });
});

describe("boxplot export", () => {
  function group(
    labels: string[],
    stats: {
      q1: number;
      median: number;
      q3: number;
      whiskerLow: number;
      whiskerHigh: number;
      mean: number;
      outliers?: number[];
    }
  ) {
    return {
      labels,
      n: 10,
      min: stats.whiskerLow,
      max: stats.whiskerHigh,
      outliers: stats.outliers ?? [],
      ...stats,
    };
  }

  function boxplot(groups: ReturnType<typeof group>[]): StatisticalAnalysisSummary {
    return {
      id: "an-5",
      workspaceId: "ws-1",
      kind: BOXPLOT,
      title: "Boxplot of Assay",
      config: {
        yColumnId: "c1",
        yColumnName: "Assay",
        categoryColumnIds: ["c2"],
        categoryColumnNames: ["Lot"],
        title: "Boxplot of Assay",
        showMeanLine: true,
      },
      results: { n: 30, skipped: 0, groups },
      sourceHash: "abc",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
  }

  const sample = [
    group(["A"], {
      q1: 10,
      median: 12,
      q3: 15,
      whiskerLow: 8,
      whiskerHigh: 18,
      mean: 12.4,
      outliers: [22, 24],
    }),
    group(["B"], {
      q1: 11,
      median: 13,
      q3: 14,
      whiskerLow: 9,
      whiskerHigh: 17,
      mean: 12.8,
    }),
  ];

  it("stacks real boxes with whisker error bars and star outliers", () => {
    const source = buildAnalysisChartSource(boxplot(sample));
    const chart = source.charts[0];
    const layout = boxplotExcelLayout(sample.length);
    expect(chart?.kind).toBe("columnStackedLine");
    expect(chart?.overlap).toBe(100);
    expect(chart?.showLegend).toBe(false);
    expect(chart?.gapWidth).toBe(layout.gapWidth);
    expect(chart?.gapWidth).toBeGreaterThan(80);
    expect(chart?.categoryAsText).toBe(true);

    const table = source.tables[0];
    expect(table?.headers.slice(0, 7)).toEqual([
      "Group",
      "Q1",
      "Q1 to median",
      "Median to Q3",
      "Lower whisker",
      "Upper whisker",
      "Mean",
    ]);
    expect(table?.rows).toHaveLength(sample.length + layout.padLeft + layout.padRight);
    expect(table?.rows[0]?.[0]).toBe(BOXPLOT_EXCEL_SPACER);
    expect(table?.rows.at(-1)?.[0]).toBe(BOXPLOT_EXCEL_SPACER);
    const dataRows = table?.rows.filter((row) => row[0] !== BOXPLOT_EXCEL_SPACER) ?? [];
    // A: base 10, 10->12, 12->15, whiskers 2 down and 3 up.
    expect(dataRows[0]?.slice(1, 6)).toEqual([10, 2, 3, 2, 3]);

    const base = chart?.series.find((item) => item.name === "Q1");
    expect(base?.hiddenFill).toBe(true);
    expect(base?.errMinusCol).toBe(4);
    expect(base?.errPlusCol).toBeUndefined();
    const top = chart?.series.find((item) => item.name === "Median to Q3");
    expect(top?.errPlusCol).toBe(5);
    expect(top?.borderColor).toBeTruthy();

    const outliers = chart?.series.filter((item) =>
      item.name.startsWith("Outlier")
    );
    expect(outliers).toHaveLength(2);
    expect(outliers?.[0]?.markerSymbol).toBe("star");
    expect(outliers?.[0]?.asLine).toBe(true);
    expect(dataRows[0]?.slice(7)).toEqual([22, 24]);
    expect(dataRows[1]?.slice(7)).toEqual([null, null]);
  });

  it("falls back to plotted statistics when a box would cross zero", () => {
    const source = buildAnalysisChartSource(
      boxplot([
        group(["A"], {
          q1: -2,
          median: 0,
          q3: 3,
          whiskerLow: -5,
          whiskerHigh: 6,
          mean: 0.5,
        }),
      ])
    );
    expect(source.charts[0]?.kind).toBe("line");
    expect(source.charts[0]?.series.map((item) => item.name)).toContain(
      "Median"
    );
  });
});
