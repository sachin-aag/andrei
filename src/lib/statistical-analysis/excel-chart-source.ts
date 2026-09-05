import { chartBrandColors, seriesFill } from "@/lib/charts/brand-colors";
import { parseChartMark, seriesPolylines } from "@/lib/charts/chart-marks";
import {
  chartShowsSpecLimits,
  layoutPoints,
  type ChartSpec,
} from "@/lib/charts/chart-spec";
import { meanLineGroups } from "@/lib/charts/mean-line";
import { resolveCustomerId } from "@/lib/customers/resolve";
import {
  EMU_PER_CM,
  type ExcelChartKind,
  type ExcelChartSeries,
  type ExcelNativeChart,
} from "./excel-chart-xml";
import { histogramChartScale } from "./histogram-chart-scale";
import {
  histogramOverlays,
  isAnovaAnalysis,
  isBoxplotAnalysis,
  isHistogramAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type StatisticalAnalysisSummary,
} from "./types";

export const CHART_SLOT_ROW_HEIGHT = 18;
export const CHARTS_PER_ROW = 2;

export type ChartSourceTable = {
  id: string;
  title: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
};

export type SeriesRef = {
  name: string;
  tableId: string;
  valCol: number;
  xCol?: number;
  catCol?: number;
  errPlusCol?: number;
  errMinusCol?: number;
  color: string;
  scatterStyle?: "marker" | "line" | "lineMarker";
  dash?: boolean;
  marker?: boolean;
  noLine?: boolean;
  hiddenFill?: boolean;
  asLine?: boolean;
  asScatter?: boolean;
  smooth?: boolean;
};

export type PlannedChart = {
  title: string;
  kind: ExcelChartKind;
  xAxisTitle?: string;
  yAxisTitle?: string;
  xMin?: number | null;
  xMax?: number | null;
  yMin?: number | null;
  yMax?: number | null;
  series: SeriesRef[];
};

export type AnalysisChartSource = {
  tables: ChartSourceTable[];
  charts: PlannedChart[];
};

export type WrittenChartTable = {
  dataStart: number;
  dataEnd: number;
  headers: string[];
  rows: Array<Array<string | number | null>>;
};

function columnCache(
  rows: Array<Array<string | number | null>>,
  col: number
): Array<number | string | null> {
  return rows.map((row) => {
    const value = row[col];
    if (value == null || value === "") return null;
    return value;
  });
}

export function chartSlotRows(chartCount: number): number {
  if (chartCount <= 0) return 0;
  return Math.ceil(chartCount / CHARTS_PER_ROW) * CHART_SLOT_ROW_HEIGHT;
}

export function chartAnchor(
  index: number,
  chartCount: number
): { anchorRow: number; anchorCol: number; widthEmu: number; heightEmu: number } {
  const twoUp = chartCount > 1;
  const widthEmu = (twoUp ? 12 : 16) * EMU_PER_CM;
  const heightEmu = (twoUp ? 7.5 : 9) * EMU_PER_CM;
  return {
    anchorRow: 1 + Math.floor(index / CHARTS_PER_ROW) * CHART_SLOT_ROW_HEIGHT,
    anchorCol: (index % CHARTS_PER_ROW) * (twoUp ? 8 : 0),
    widthEmu,
    heightEmu,
  };
}

export function resolvePlannedCharts(
  sheetName: string,
  charts: PlannedChart[],
  written: Map<string, WrittenChartTable>
): ExcelNativeChart[] {
  return charts.flatMap((chart, index) => {
    const series: ExcelChartSeries[] = chart.series.flatMap((ref) => {
      const table = written.get(ref.tableId);
      if (!table || table.dataEnd < table.dataStart) return [];
      const range = (col: number) => ({
        sheetName,
        col0: col,
        rowStart: table.dataStart,
        rowEnd: table.dataEnd,
        cache: columnCache(table.rows, col),
      });
      return [
        {
          name: ref.name,
          color: ref.color,
          vals: range(ref.valCol),
          x: ref.xCol != null ? range(ref.xCol) : undefined,
          cats: ref.catCol != null ? range(ref.catCol) : undefined,
          errPlus: ref.errPlusCol != null ? range(ref.errPlusCol) : undefined,
          errMinus: ref.errMinusCol != null ? range(ref.errMinusCol) : undefined,
          scatterStyle: ref.scatterStyle,
          dash: ref.dash,
          marker: ref.marker,
          noLine: ref.noLine,
          hiddenFill: ref.hiddenFill,
          asLine: ref.asLine,
          asScatter: ref.asScatter,
          smooth: ref.smooth,
        } satisfies ExcelChartSeries,
      ];
    });
    if (series.length === 0) return [];
    const anchor = chartAnchor(index, charts.length);
    return [
      {
        title: chart.title,
        kind: chart.kind,
        xAxisTitle: chart.xAxisTitle,
        yAxisTitle: chart.yAxisTitle,
        xMin: chart.xMin,
        xMax: chart.xMax,
        yMin: chart.yMin,
        yMax: chart.yMax,
        series,
        ...anchor,
      } satisfies ExcelNativeChart,
    ];
  });
}

function padRows(
  rows: Array<Array<string | number | null>>,
  width: number
): Array<Array<string | number | null>> {
  return rows.map((row) => {
    const next = row.slice();
    while (next.length < width) next.push(null);
    return next;
  });
}

function paddedHistogramCategories(
  bins: Array<{ x0: number; x1: number; count: number }>,
  xMin: number,
  xMax: number
): Array<{ midpoint: number; count: number | null }> {
  if (bins.length === 0) return [];
  const width = bins[0]!.x1 - bins[0]!.x0;
  const rows: Array<{ midpoint: number; count: number | null }> = bins.map(
    (bin) => ({
      midpoint: (bin.x0 + bin.x1) / 2,
      count: bin.count,
    })
  );
  if (!(width > 0)) return rows;
  const firstX0 = bins[0]!.x0;
  const lastX1 = bins[bins.length - 1]!.x1;
  for (let i = 1; firstX0 - i * width + width / 2 >= xMin; i += 1) {
    const x0 = firstX0 - i * width;
    rows.unshift({ midpoint: x0 + width / 2, count: null });
  }
  for (let i = 1; lastX1 + (i - 1) * width + width / 2 <= xMax; i += 1) {
    const x0 = lastX1 + (i - 1) * width;
    rows.push({ midpoint: x0 + width / 2, count: null });
  }
  return rows;
}

function scatterKind(mark: ReturnType<typeof parseChartMark>): {
  kind: ExcelChartKind;
  scatterStyle?: "marker" | "line" | "lineMarker";
} {
  switch (mark) {
    case "scatter":
      return { kind: "scatter", scatterStyle: "marker" };
    case "line":
      return { kind: "scatter", scatterStyle: "line" };
    case "line_markers":
      return { kind: "scatter", scatterStyle: "lineMarker" };
    case "area":
      return { kind: "area" };
    case "column":
      return { kind: "column" };
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

function specCharts(
  spec: ChartSpec,
  colors: ReturnType<typeof chartBrandColors>,
  idPrefix: string
): AnalysisChartSource {
  const points = layoutPoints(spec);
  if (points.length === 0) return { tables: [], charts: [] };
  const mark = parseChartMark(spec.layout.mark);
  const mapped = scatterKind(mark);
  const groups = seriesPolylines(points);
  const useLegend =
    spec.layout.seriesBy === "unit" &&
    groups.some((group) => (group.series ?? "").length > 0);
  const seriesGroups = useLegend
    ? groups
    : [{ series: spec.yLabel || "Y", points }];

  const tables: ChartSourceTable[] = [];
  const charts: PlannedChart[] = [];
  const specs = spec.layout.mode === "per-series" ? seriesGroups : [null];

  for (const [specIndex, only] of specs.entries()) {
    const localGroups = only ? [only] : seriesGroups;
    const tableId = `${idPrefix}-${specIndex}`;
    const showLimits = chartShowsSpecLimits(spec.layout);
    const showMean = spec.layout.showMeanLine === true;

    if (mapped.kind === "column" || mapped.kind === "area") {
      const xs = [...new Set(points.map((point) => point.x))].toSorted(
        (a, b) => a - b
      );
      const headers = [
        spec.xLabel || "X",
        ...localGroups.map(
          (group, index) => group.series || spec.yLabel || `Series ${index + 1}`
        ),
      ];
      if (showLimits && spec.limits.lower != null) headers.push("LSL");
      if (showLimits && spec.limits.upper != null) headers.push("USL");
      const rows: Array<Array<string | number | null>> = xs.map((x) => {
        const row: Array<string | number | null> = [x];
        for (const group of localGroups) {
          const atX = group.points.filter((point) => point.x === x);
          if (atX.length === 0) {
            row.push(null);
            continue;
          }
          row.push(atX.reduce((sum, point) => sum + point.y, 0));
        }
        if (showLimits && spec.limits.lower != null) row.push(spec.limits.lower);
        if (showLimits && spec.limits.upper != null) row.push(spec.limits.upper);
        return row;
      });
      tables.push({
        id: tableId,
        title: spec.title,
        headers,
        rows: padRows(rows, headers.length),
      });
      const series: SeriesRef[] = localGroups.map((group, index) => ({
        name: group.series || spec.yLabel || `Series ${index + 1}`,
        tableId,
        catCol: 0,
        valCol: index + 1,
        color: seriesFill(colors, index),
        asLine: false,
      }));
      let nextCol = localGroups.length + 1;
      if (showLimits && spec.limits.lower != null) {
        series.push({
          name: "LSL",
          tableId,
          catCol: 0,
          valCol: nextCol,
          color: colors.limit,
          dash: true,
          noLine: false,
          marker: false,
          asLine: mapped.kind === "column",
        });
        nextCol += 1;
      }
      if (showLimits && spec.limits.upper != null) {
        series.push({
          name: "USL",
          tableId,
          catCol: 0,
          valCol: nextCol,
          color: colors.limit,
          dash: true,
          noLine: false,
          marker: false,
          asLine: mapped.kind === "column",
        });
      }
      const hasLimitLines = series.some((item) => item.asLine);
      charts.push({
        title: spec.title,
        kind:
          mapped.kind === "column" && hasLimitLines
            ? "columnLine"
            : spec.layout.seriesBy === "unit" && mapped.kind === "column"
              ? "columnStacked"
              : mapped.kind,
        xAxisTitle: spec.xLabel,
        yAxisTitle: spec.yLabel,
        yMin: spec.layout.yRange?.min,
        yMax: spec.layout.yRange?.max,
        series,
      });
      continue;
    }

    const headers: string[] = [];
    for (const group of localGroups) {
      const name = group.series || spec.yLabel || "Y";
      headers.push(`${name} X`, name);
    }
    if (showLimits && spec.limits.lower != null) headers.push("LSL X", "LSL");
    if (showLimits && spec.limits.upper != null) headers.push("USL X", "USL");
    const meanGroups = showMean
      ? meanLineGroups(points, spec.layout.seriesBy)
      : [];
    for (const group of meanGroups) {
      const name = group.series ? `${group.series} mean` : "Mean";
      headers.push(`${name} X`, name);
    }

    const maxLen = Math.max(
      ...localGroups.map((group) => group.points.length),
      2,
      ...meanGroups.map((group) => group.points.length)
    );
    const xs = localGroups.flatMap((group) => group.points.map((point) => point.x));
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const rows: Array<Array<string | number | null>> = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Array<string | number | null> = [];
      for (const group of localGroups) {
        const point = group.points[i];
        row.push(point ? point.x : null, point ? point.y : null);
      }
      if (showLimits && spec.limits.lower != null) {
        row.push(i === 0 ? xMin : i === 1 ? xMax : null, spec.limits.lower);
      }
      if (showLimits && spec.limits.upper != null) {
        row.push(i === 0 ? xMin : i === 1 ? xMax : null, spec.limits.upper);
      }
      for (const group of meanGroups) {
        const point = group.points[i];
        row.push(point ? point.x : null, point ? point.y : null);
      }
      rows.push(row);
    }
    tables.push({
      id: tableId,
      title: spec.title,
      headers,
      rows: padRows(rows, headers.length),
    });

    const series: SeriesRef[] = [];
    let col = 0;
    for (const [index, group] of localGroups.entries()) {
      series.push({
        name: group.series || spec.yLabel || `Series ${index + 1}`,
        tableId,
        xCol: col,
        valCol: col + 1,
        color: seriesFill(colors, index),
        scatterStyle: mapped.scatterStyle,
        marker: mapped.scatterStyle !== "line",
      });
      col += 2;
    }
    if (showLimits && spec.limits.lower != null) {
      series.push({
        name: "LSL",
        tableId,
        xCol: col,
        valCol: col + 1,
        color: colors.limit,
        scatterStyle: "line",
        dash: true,
        marker: false,
      });
      col += 2;
    }
    if (showLimits && spec.limits.upper != null) {
      series.push({
        name: "USL",
        tableId,
        xCol: col,
        valCol: col + 1,
        color: colors.limit,
        scatterStyle: "line",
        dash: true,
        marker: false,
      });
      col += 2;
    }
    for (const group of meanGroups) {
      series.push({
        name: group.series ? `${group.series} mean` : "Mean",
        tableId,
        xCol: col,
        valCol: col + 1,
        color: colors.axis,
        scatterStyle: "lineMarker",
        marker: true,
      });
      col += 2;
    }
    charts.push({
      title: spec.title,
      kind: "scatter",
      xAxisTitle: spec.xLabel,
      yAxisTitle: spec.yLabel,
      xMin: spec.layout.xRange?.min,
      xMax: spec.layout.xRange?.max,
      yMin: spec.layout.yRange?.min,
      yMax: spec.layout.yRange?.max,
      series,
    });
  }

  return { tables, charts };
}

function sixpackCharts(
  analysis: Extract<StatisticalAnalysisSummary, { kind: "capability_sixpack_normal" }>,
  colors: ReturnType<typeof chartBrandColors>
): AnalysisChartSource {
  const { results, config, title } = analysis;
  const tables: ChartSourceTable[] = [];
  const charts: PlannedChart[] = [];
  const index = results.individuals.values.map((_, i) => i + 1);

  const iRows = results.individuals.values.map((value, i) => {
    const row: Array<string | number | null> = [
      index[i]!,
      value,
      results.individuals.ucl,
      results.individuals.center,
      results.individuals.lcl,
    ];
    if (config.lsl != null) row.push(config.lsl);
    if (config.usl != null) row.push(config.usl);
    return row;
  });
  const iHeaders = ["Index", "Value", "UCL", "CL", "LCL"];
  if (config.lsl != null) iHeaders.push("LSL");
  if (config.usl != null) iHeaders.push("USL");
  tables.push({ id: "i-chart", title: "I Chart data", headers: iHeaders, rows: iRows });
  const iSeries: SeriesRef[] = [
    { name: "Value", tableId: "i-chart", catCol: 0, valCol: 1, color: colors.brand600, marker: true },
    { name: "UCL", tableId: "i-chart", catCol: 0, valCol: 2, color: colors.brand400, dash: true, noLine: false, marker: false },
    { name: "CL", tableId: "i-chart", catCol: 0, valCol: 3, color: colors.axis, dash: true, noLine: false, marker: false },
    { name: "LCL", tableId: "i-chart", catCol: 0, valCol: 4, color: colors.brand400, dash: true, noLine: false, marker: false },
  ];
  let col = 5;
  if (config.lsl != null) {
    iSeries.push({ name: "LSL", tableId: "i-chart", catCol: 0, valCol: col, color: colors.limit, dash: true, marker: false });
    col += 1;
  }
  if (config.usl != null) {
    iSeries.push({ name: "USL", tableId: "i-chart", catCol: 0, valCol: col, color: colors.limit, dash: true, marker: false });
  }
  charts.push({
    title: `${title} — I Chart`,
    kind: "line",
    xAxisTitle: "Observation",
    yAxisTitle: config.columnName,
    series: iSeries,
  });

  const last = results.lastObservations;
  if (last.length > 0) {
    tables.push({
      id: "last-25",
      title: "Last 25 observations",
      headers: ["Index", "Value"],
      rows: last.map((value, i) => [i + 1, value]),
    });
    charts.push({
      title: `${title} — Last 25 Observations`,
      kind: "line",
      xAxisTitle: "Observation",
      yAxisTitle: config.columnName,
      series: [
        { name: "Value", tableId: "last-25", catCol: 0, valCol: 1, color: colors.brand600, marker: true },
      ],
    });
  }

  const hist = histogramTable(
    "capability-hist",
    "Capability Histogram data",
    results.histogram,
    config.lsl,
    config.usl,
    true,
    true,
    true,
    colors
  );
  tables.push(...hist.tables);
  charts.push(
    ...hist.charts.map((chart) => ({
      ...chart,
      title: `${title} — Capability Histogram`,
    }))
  );

  const mr = results.movingRange.values;
  if (mr.length > 0) {
    tables.push({
      id: "mr-chart",
      title: "Moving Range data",
      headers: ["Index", "MR", "UCL", "CL", "LCL"],
      rows: mr.map((value, i) => [
        i + 1,
        value,
        results.movingRange.ucl,
        results.movingRange.center,
        results.movingRange.lcl,
      ]),
    });
    charts.push({
      title: `${title} — Moving Range Chart`,
      kind: "line",
      xAxisTitle: "Observation",
      yAxisTitle: "Moving range",
      series: [
        { name: "MR", tableId: "mr-chart", catCol: 0, valCol: 1, color: colors.brand600, marker: true },
        { name: "UCL", tableId: "mr-chart", catCol: 0, valCol: 2, color: colors.brand400, dash: true, marker: false },
        { name: "CL", tableId: "mr-chart", catCol: 0, valCol: 3, color: colors.axis, dash: true, marker: false },
        { name: "LCL", tableId: "mr-chart", catCol: 0, valCol: 4, color: colors.brand400, dash: true, marker: false },
      ],
    });
  }

  const np = results.normalPlot.points;
  if (np.length > 0) {
    tables.push({
      id: "normal-plot",
      title: "Normal probability data",
      headers: ["Z", "Value", "Fit Z", "Fit"],
      rows: np.map((point, i) => [
        point.z,
        point.value,
        i === 0 ? results.normalPlot.lineStart.z : i === 1 ? results.normalPlot.lineEnd.z : null,
        i === 0 ? results.normalPlot.lineStart.value : i === 1 ? results.normalPlot.lineEnd.value : null,
      ]),
    });
    charts.push({
      title: `${title} — Normal Probability Plot`,
      kind: "scatter",
      xAxisTitle: "Normal score",
      yAxisTitle: config.columnName,
      series: [
        {
          name: "Value",
          tableId: "normal-plot",
          xCol: 0,
          valCol: 1,
          color: colors.brand600,
          scatterStyle: "marker",
          marker: true,
        },
        {
          name: "Fit",
          tableId: "normal-plot",
          xCol: 2,
          valCol: 3,
          color: colors.brand400,
          scatterStyle: "line",
          marker: false,
        },
      ],
    });
  }

  return { tables, charts };
}

function histogramTable(
  id: string,
  title: string,
  histogram: {
    bins: Array<{ x0: number; x1: number; count: number }>;
    overallCurve: Array<{ x: number; y: number }>;
    withinCurve: Array<{ x: number; y: number }>;
  },
  lsl: number | null,
  usl: number | null,
  showDistributionLines: boolean,
  showLsl: boolean,
  showUsl: boolean,
  colors: ReturnType<typeof chartBrandColors>
): AnalysisChartSource {
  if (histogram.bins.length === 0) return { tables: [], charts: [] };
  const scale = histogramChartScale({
    bins: histogram.bins,
    overallCurve: histogram.overallCurve,
    withinCurve: histogram.withinCurve,
    lsl,
    usl,
    showDistributionLines,
    showLsl,
    showUsl,
  });
  const categories = paddedHistogramCategories(
    histogram.bins,
    scale.xMin,
    scale.xMax
  );
  const width = histogram.bins[0]!.x1 - histogram.bins[0]!.x0;
  const first = categories[0]!;
  const last = categories[categories.length - 1]!;
  const xMin = width > 0 ? first.midpoint - width / 2 : scale.xMin;
  const xMax = width > 0 ? last.midpoint + width / 2 : scale.xMax;
  const tables: ChartSourceTable[] = [
    {
      id,
      title,
      headers: ["Midpoint", "Count"],
      rows: categories.map((bin) => [bin.midpoint, bin.count]),
    },
  ];
  const series: SeriesRef[] = [
    {
      name: "Count",
      tableId: id,
      catCol: 0,
      valCol: 1,
      color: colors.brand600,
    },
  ];
  const showOverall =
    showDistributionLines && histogram.overallCurve.length > 0;
  const showWithin =
    showDistributionLines && histogram.withinCurve.length > 0;
  if (showOverall || showWithin) {
    const headers = ["X"];
    if (showOverall) headers.push("Overall");
    if (showWithin) headers.push("Within");
    const n = Math.max(
      showOverall ? histogram.overallCurve.length : 0,
      showWithin ? histogram.withinCurve.length : 0
    );
    const rows = Array.from({ length: n }, (_, i) => {
      const x =
        histogram.overallCurve[i]?.x ?? histogram.withinCurve[i]?.x ?? null;
      const row: Array<string | number | null> = [x];
      if (showOverall) row.push(histogram.overallCurve[i]?.y ?? null);
      if (showWithin) row.push(histogram.withinCurve[i]?.y ?? null);
      return row;
    });
    tables.push({
      id: `${id}-fit`,
      title: `${title} — distribution fit`,
      headers,
      rows,
    });
    let col = 1;
    if (showOverall) {
      series.push({
        name: "Overall",
        tableId: `${id}-fit`,
        xCol: 0,
        valCol: col,
        color: colors.brand400,
        marker: false,
        dash: true,
        asScatter: true,
        smooth: true,
        scatterStyle: "line",
      });
      col += 1;
    }
    if (showWithin) {
      series.push({
        name: "Within",
        tableId: `${id}-fit`,
        xCol: 0,
        valCol: col,
        color: colors.brand600,
        marker: false,
        asScatter: true,
        smooth: true,
        scatterStyle: "line",
      });
    }
  }
  if (showLsl && lsl != null) {
    tables.push({
      id: `${id}-lsl`,
      title: "LSL",
      headers: ["X", "LSL"],
      rows: [
        [lsl, 0],
        [lsl, scale.yMax],
      ],
    });
    series.push({
      name: "LSL",
      tableId: `${id}-lsl`,
      xCol: 0,
      valCol: 1,
      color: colors.limit,
      dash: true,
      marker: false,
      asScatter: true,
      scatterStyle: "line",
    });
  }
  if (showUsl && usl != null) {
    tables.push({
      id: `${id}-usl`,
      title: "USL",
      headers: ["X", "USL"],
      rows: [
        [usl, 0],
        [usl, scale.yMax],
      ],
    });
    series.push({
      name: "USL",
      tableId: `${id}-usl`,
      xCol: 0,
      valCol: 1,
      color: colors.limit,
      dash: true,
      marker: false,
      asScatter: true,
      scatterStyle: "line",
    });
  }
  const hasScatter = series.some((item) => item.asScatter);
  return {
    tables,
    charts: [
      {
        title,
        kind: hasScatter ? "columnScatter" : "column",
        xAxisTitle: "Measurement",
        yAxisTitle: "Count",
        xMin,
        xMax,
        yMin: 0,
        yMax: scale.yMax,
        series,
      },
    ],
  };
}

function anovaCharts(
  analysis: Extract<StatisticalAnalysisSummary, { kind: "one_way_anova" }>,
  colors: ReturnType<typeof chartBrandColors>
): AnalysisChartSource {
  const groups = analysis.results.groups;
  if (groups.length === 0) return { tables: [], charts: [] };
  const rows = groups.map((group) => [
    group.label,
    group.mean,
    Math.max(0, group.ciHigh - group.mean),
    Math.max(0, group.mean - group.ciLow),
  ]);
  return {
    tables: [
      {
        id: "anova",
        title: "Interval plot data",
        headers: ["Group", "Mean", "CI plus", "CI minus"],
        rows,
      },
    ],
    charts: [
      {
        title: analysis.title,
        kind: "line",
        xAxisTitle: analysis.config.factorColumnName,
        yAxisTitle: analysis.config.responseColumnName,
        series: [
          {
            name: "Mean",
            tableId: "anova",
            catCol: 0,
            valCol: 1,
            errPlusCol: 2,
            errMinusCol: 3,
            color: colors.brand600,
            marker: true,
            noLine: true,
          },
        ],
      },
    ],
  };
}

function boxplotCharts(
  analysis: Extract<StatisticalAnalysisSummary, { kind: "boxplot" }>,
  colors: ReturnType<typeof chartBrandColors>
): AnalysisChartSource {
  const groups = analysis.results.groups;
  if (groups.length === 0) return { tables: [], charts: [] };
  const rows = groups.map((group) => [
    group.labels.join(" / ") || "All",
    group.whiskerLow,
    group.q1,
    group.median,
    group.q3,
    group.whiskerHigh,
    group.mean,
  ]);
  const series: SeriesRef[] = [
    { name: "Whisker low", tableId: "boxplot", catCol: 0, valCol: 1, color: colors.axis, marker: true, noLine: true },
    { name: "Q1", tableId: "boxplot", catCol: 0, valCol: 2, color: colors.brand400, marker: true, noLine: true },
    { name: "Median", tableId: "boxplot", catCol: 0, valCol: 3, color: colors.brand600, marker: true },
    { name: "Q3", tableId: "boxplot", catCol: 0, valCol: 4, color: colors.brand400, marker: true, noLine: true },
    { name: "Whisker high", tableId: "boxplot", catCol: 0, valCol: 5, color: colors.axis, marker: true, noLine: true },
  ];
  if (analysis.config.showMeanLine) {
    series.push({
      name: "Mean",
      tableId: "boxplot",
      catCol: 0,
      valCol: 6,
      color: colors.series[1] ?? colors.axis,
      marker: true,
    });
  }
  const outlierRows = groups.flatMap((group) =>
    group.outliers.map((value) => [group.labels.join(" / ") || "All", value])
  );
  const tables: ChartSourceTable[] = [
    {
      id: "boxplot",
      title: "Boxplot data",
      headers: ["Group", "Whisker low", "Q1", "Median", "Q3", "Whisker high", "Mean"],
      rows,
    },
  ];
  if (outlierRows.length > 0) {
    tables.push({
      id: "outliers",
      title: "Outliers",
      headers: ["Group", "Value"],
      rows: outlierRows,
    });
  }
  return {
    tables,
    charts: [
      {
        title: analysis.title,
        kind: "line",
        xAxisTitle: analysis.config.categoryColumnNames.join(", ") || undefined,
        yAxisTitle: analysis.config.yColumnName,
        series,
      },
    ],
  };
}

export function buildAnalysisChartSource(
  analysis: StatisticalAnalysisSummary
): AnalysisChartSource {
  const colors = chartBrandColors(resolveCustomerId());
  if (isScatterAnalysis(analysis) || isXyScatterAnalysis(analysis)) {
    const combined: AnalysisChartSource = { tables: [], charts: [] };
    for (const [index, spec] of analysis.results.specs.entries()) {
      const part = specCharts(spec, colors, `scatter-${index}`);
      combined.tables.push(...part.tables);
      combined.charts.push(...part.charts);
    }
    return combined;
  }
  if (isSixpackAnalysis(analysis)) return sixpackCharts(analysis, colors);
  if (isHistogramAnalysis(analysis)) {
    const overlays = histogramOverlays(analysis.config);
    const built = histogramTable(
      "histogram",
      analysis.title,
      analysis.results.histogram,
      analysis.config.lsl,
      analysis.config.usl,
      overlays.showDistributionLines,
      overlays.showLsl,
      overlays.showUsl,
      colors
    );
    return built;
  }
  if (isAnovaAnalysis(analysis)) return anovaCharts(analysis, colors);
  if (isBoxplotAnalysis(analysis)) return boxplotCharts(analysis, colors);
  const exhaustive: never = analysis;
  return exhaustive;
}
