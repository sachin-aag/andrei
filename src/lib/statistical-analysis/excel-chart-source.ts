import {
  ANOVA_AXIS_PAD,
  CONTROL_CHART_AXIS_PAD,
  PROBABILITY_PLOT_AXIS_PAD,
  midpointMajorUnit,
  paddedDomain,
} from "@/lib/charts/axis-domain";
import { axisMajorUnit } from "@/lib/charts/axis-ticks";
import { chartBrandColors, seriesFill } from "@/lib/charts/brand-colors";
import { parseChartMark, seriesPolylines } from "@/lib/charts/chart-marks";
import {
  chartShowsSpecLimits,
  layoutPoints,
  resolveXRange,
  resolveYRange,
  type ChartSpec,
} from "@/lib/charts/chart-spec";
import {
  MEAN_LINE_INDIVIDUAL_FILL,
  meanLineGroups,
} from "@/lib/charts/mean-line";
import { resolveCustomerId } from "@/lib/customers/resolve";
import {
  EMU_PER_CM,
  type ExcelChartKind,
  type ExcelChartSeries,
  type ExcelNativeChart,
} from "./excel-chart-xml";
import {
  BOXPLOT_EXCEL_SPACER,
  boxplotExcelLayout,
  boxplotTickStep,
  boxplotYExtent,
} from "./boxplot-chart-layout";
import { formatLimit, formatPValue, formatStat } from "./format";
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
/** Marker diameter in points — the SVG panels scale their dots with the plot. */
const TWO_UP_MARKER_PT = 5;
const SINGLE_MARKER_PT = 7;
const OUT_OF_CONTROL_MARKER_PT = 7;
const BOX_FILL_OPACITY = 0.45;
const MAX_PLOTTED_OUTLIERS = 8;
/** Matches the 0.18 fill alpha the SVG and PNG renderers use for area marks. */
const AREA_FILL_OPACITY = 0.18;

export type ChartSourceTable = {
  id: string;
  title: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
};

export type SeriesRef = {
  name: string;
  markerSymbol?: ExcelChartSeries["markerSymbol"];
  errColor?: string;
  pointOverrides?: Array<{ index: number; color: string; markerSize?: number }>;
  valueLabel?: {
    index: number;
    text: string;
    color?: string;
    position?: "t" | "b" | "l" | "r" | "ctr";
  };
  borderColor?: string;
  lineColor?: string;
  fillOpacity?: number;
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
  /** Place this series on the scatter overlay of a column+scatter combo. */
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
  xMajorUnit?: number | null;
  yMajorUnit?: number | null;
  subtitle?: string;
  gapWidth?: number;
  overlap?: number;
  tickLblSkip?: number;
  forceCategoryAxis?: boolean;
  categoryAsText?: boolean;
  /** Bottom legend. Off where the app labels values inline instead. */
  showLegend?: boolean;
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
  const colors = chartBrandColors(resolveCustomerId());
  const twoUp = charts.length > 1;
  const live = charts.flatMap((chart) => {
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
          markerSymbol: ref.markerSymbol,
          errColor: ref.errColor,
          pointOverrides: ref.pointOverrides,
          valueLabel: ref.valueLabel,
          borderColor: ref.borderColor,
          lineColor: ref.lineColor,
          fillOpacity: ref.fillOpacity,
          markerSize: twoUp ? TWO_UP_MARKER_PT : SINGLE_MARKER_PT,
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
    return [{ chart, series }];
  });
  return live.map(({ chart, series }, index) => {
    const anchor = chartAnchor(index, live.length);
    return {
      title: chart.title,
      kind: chart.kind,
      xAxisTitle: chart.xAxisTitle,
      yAxisTitle: chart.yAxisTitle,
      xMin: chart.xMin,
      xMax: chart.xMax,
      yMin: chart.yMin,
      yMax: chart.yMax,
      xMajorUnit: chart.xMajorUnit,
      yMajorUnit: chart.yMajorUnit,
      subtitle: chart.subtitle,
      gapWidth: chart.gapWidth,
      overlap: chart.overlap,
      tickLblSkip: chart.tickLblSkip,
      forceCategoryAxis: chart.forceCategoryAxis,
      categoryAsText: chart.categoryAsText,
      showLegend: chart.showLegend,
      axisColor: colors.axis,
      gridColor: colors.grid,
      titleColor: colors.foreground,
      series,
      ...anchor,
    } satisfies ExcelNativeChart;
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
): Array<{ midpoint: number; count: number }> {
  if (bins.length === 0) return [];
  const width = bins[0]!.x1 - bins[0]!.x0;
  const rows: Array<{ midpoint: number; count: number }> = bins.map((bin) => ({
    midpoint: (bin.x0 + bin.x1) / 2,
    count: bin.count,
  }));
  if (!(width > 0)) return rows;
  const firstX0 = bins[0]!.x0;
  const lastX1 = bins[bins.length - 1]!.x1;
  for (let i = 1; firstX0 - i * width + width / 2 >= xMin; i += 1) {
    const x0 = firstX0 - i * width;
    rows.unshift({ midpoint: x0 + width / 2, count: 0 });
  }
  for (let i = 1; lastX1 + (i - 1) * width + width / 2 <= xMax; i += 1) {
    const x0 = lastX1 + (i - 1) * width;
    rows.push({ midpoint: x0 + width / 2, count: 0 });
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
  // The SVG views colour by sorted series name; keep the mapping identical.
  const seriesGroups = useLegend
    ? groups.toSorted((a, b) =>
        (a.series ?? "").localeCompare(b.series ?? "", undefined, {
          numeric: true,
          sensitivity: "base",
        })
      )
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
        fillOpacity: mapped.kind === "area" ? AREA_FILL_OPACITY : undefined,
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
          asLine: mapped.kind === "column" || mapped.kind === "area",
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
          asLine: mapped.kind === "column" || mapped.kind === "area",
        });
      }
      const hasLimitLines = series.some((item) => item.asLine);
      const columnY = resolveYRange({ ...spec, points });
      charts.push({
        title: spec.title,
        kind:
          mapped.kind === "column" && hasLimitLines
            ? "columnLine"
            : mapped.kind === "area" && hasLimitLines
              ? "areaLine"
              : spec.layout.seriesBy === "unit" && mapped.kind === "column"
                ? "columnStacked"
                : mapped.kind,
        xAxisTitle: spec.xLabel,
        yAxisTitle: spec.yLabel,
        yMin: columnY.min,
        yMax: columnY.max,
        yMajorUnit: axisMajorUnit(columnY.min, columnY.max),
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
    const dimIndividuals = showMean && !useLegend;
    for (const [index, group] of localGroups.entries()) {
      series.push({
        name: group.series || spec.yLabel || `Series ${index + 1}`,
        tableId,
        xCol: col,
        valCol: col + 1,
        color: dimIndividuals
          ? MEAN_LINE_INDIVIDUAL_FILL
          : seriesFill(colors, index),
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
    const seriesOrder = new Map(
      seriesGroups.map((group, index) => [group.series ?? "", index])
    );
    for (const group of meanGroups) {
      series.push({
        name: group.series ? `${group.series} mean` : "Mean",
        tableId,
        xCol: col,
        valCol: col + 1,
        color: useLegend
          ? seriesFill(colors, seriesOrder.get(group.series ?? "") ?? 0)
          : colors.brand600,
        scatterStyle: "lineMarker",
        marker: true,
      });
      col += 2;
    }
    const scatterX = resolveXRange({ ...spec, points });
    const scatterY = resolveYRange({ ...spec, points });
    charts.push({
      title: spec.title,
      kind: "scatter",
      xAxisTitle: spec.xLabel,
      yAxisTitle: spec.yLabel,
      xMin: scatterX.min,
      xMax: scatterX.max,
      yMin: scatterY.min,
      yMax: scatterY.max,
      xMajorUnit: axisMajorUnit(scatterX.min, scatterX.max),
      yMajorUnit: axisMajorUnit(scatterY.min, scatterY.max),
      series,
    });
  }

  return { tables, charts };
}

/**
 * The SVG panels print each limit's value at the end of its line instead of
 * carrying a legend. Excel needs a literal label because a spec line's Y value
 * is the plot ceiling, not the limit.
 */
function limitLabel(
  value: number,
  lastIndex: number,
  position: "t" | "b",
  color: string
): SeriesRef["valueLabel"] {
  return { index: lastIndex, text: formatLimit(value), color, position };
}

/** Same window the SVG panel frames, so the exported twin is not auto-scaled. */
function controlChartAxis(values: number[]): {
  yMin: number;
  yMax: number;
  yMajorUnit: number;
} {
  const [yMin, yMax] = paddedDomain(values, CONTROL_CHART_AXIS_PAD);
  return { yMin, yMax, yMajorUnit: midpointMajorUnit(yMin, yMax) };
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
  const lastIndex = Math.max(0, results.individuals.values.length - 1);
  const iSeries: SeriesRef[] = [
    {
      name: "Value",
      tableId: "i-chart",
      catCol: 0,
      valCol: 1,
      color: colors.brand600,
      lineColor: colors.foreground,
      marker: true,
      pointOverrides: results.individuals.outOfControl.map((index) => ({
        index,
        color: colors.limit,
        markerSize: OUT_OF_CONTROL_MARKER_PT,
      })),
    },
    { name: "UCL", tableId: "i-chart", catCol: 0, valCol: 2, color: colors.brand400, dash: true, noLine: false, marker: false, valueLabel: limitLabel(results.individuals.ucl, lastIndex, "t", colors.limit) },
    { name: "CL", tableId: "i-chart", catCol: 0, valCol: 3, color: colors.axis, dash: true, noLine: false, marker: false },
    { name: "LCL", tableId: "i-chart", catCol: 0, valCol: 4, color: colors.brand400, dash: true, noLine: false, marker: false, valueLabel: limitLabel(results.individuals.lcl, lastIndex, "b", colors.limit) },
  ];
  let col = 5;
  if (config.lsl != null) {
    iSeries.push({ name: "LSL", tableId: "i-chart", catCol: 0, valCol: col, color: colors.limit, dash: true, marker: false, valueLabel: limitLabel(config.lsl, lastIndex, "b", colors.limit) });
    col += 1;
  }
  if (config.usl != null) {
    iSeries.push({ name: "USL", tableId: "i-chart", catCol: 0, valCol: col, color: colors.limit, dash: true, marker: false, valueLabel: limitLabel(config.usl, lastIndex, "t", colors.limit) });
  }
  const specValues = [config.lsl, config.usl].filter(
    (value): value is number => value != null && Number.isFinite(value)
  );
  charts.push({
    title: `${title} — I Chart`,
    kind: "line",
    xAxisTitle: "Observation",
    yAxisTitle: config.columnName,
    ...controlChartAxis([
      ...results.individuals.values,
      results.individuals.center,
      results.individuals.ucl,
      results.individuals.lcl,
      ...specValues,
    ]),
    showLegend: false,
    series: iSeries,
  });

  const last = results.lastObservations;
  if (last.length > 0) {
    // Observation numbers continue the run, matching the panel's x offset.
    const firstObservation = Math.max(1, results.n - last.length + 1);
    const lastHeaders = ["Index", "Value", "CL"];
    if (config.lsl != null) lastHeaders.push("LSL");
    if (config.usl != null) lastHeaders.push("USL");
    tables.push({
      id: "last-25",
      title: "Last 25 observations",
      headers: lastHeaders,
      rows: last.map((value, i) => {
        const row: Array<string | number | null> = [
          firstObservation + i,
          value,
          results.mean,
        ];
        if (config.lsl != null) row.push(config.lsl);
        if (config.usl != null) row.push(config.usl);
        return row;
      }),
    });
    const lastSeries: SeriesRef[] = [
      { name: "Value", tableId: "last-25", catCol: 0, valCol: 1, color: colors.brand600, lineColor: colors.foreground, marker: true },
      { name: "CL", tableId: "last-25", catCol: 0, valCol: 2, color: colors.brand600, marker: false },
    ];
    const lastPoint = last.length - 1;
    let lastCol = 3;
    if (config.lsl != null) {
      lastSeries.push({ name: "LSL", tableId: "last-25", catCol: 0, valCol: lastCol, color: colors.limit, dash: true, marker: false, valueLabel: limitLabel(config.lsl, lastPoint, "b", colors.limit) });
      lastCol += 1;
    }
    if (config.usl != null) {
      lastSeries.push({ name: "USL", tableId: "last-25", catCol: 0, valCol: lastCol, color: colors.limit, dash: true, marker: false, valueLabel: limitLabel(config.usl, lastPoint, "t", colors.limit) });
    }
    charts.push({
      title: `${title} — Last 25 Observations`,
      kind: "line",
      xAxisTitle: "Observation",
      yAxisTitle: config.columnName,
      ...controlChartAxis([...last, results.mean, ...specValues]),
      showLegend: false,
      series: lastSeries,
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
        // Each moving range belongs to the second of its pair.
        i + 2,
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
      ...controlChartAxis([
        ...mr,
        results.movingRange.center,
        results.movingRange.ucl,
        results.movingRange.lcl,
      ]),
      showLegend: false,
      series: [
        { name: "MR", tableId: "mr-chart", catCol: 0, valCol: 1, color: colors.brand600, lineColor: colors.foreground, marker: true },
        { name: "UCL", tableId: "mr-chart", catCol: 0, valCol: 2, color: colors.brand400, dash: true, marker: false, valueLabel: limitLabel(results.movingRange.ucl, mr.length - 1, "t", colors.limit) },
        { name: "CL", tableId: "mr-chart", catCol: 0, valCol: 3, color: colors.axis, dash: true, marker: false },
        { name: "LCL", tableId: "mr-chart", catCol: 0, valCol: 4, color: colors.brand400, dash: true, marker: false, valueLabel: limitLabel(results.movingRange.lcl, mr.length - 1, "b", colors.limit) },
      ],
    });
  }

  const np = results.normalPlot.points;
  if (np.length > 0) {
    tables.push({
      id: "normal-plot",
      title: "Normal probability data",
      headers: ["Z", "Value", "Fit Z", "Fit", "CI Z", "CI low", "CI high"],
      rows: np.map((point, i) => [
        point.z,
        point.value,
        i === 0 ? results.normalPlot.lineStart.z : i === 1 ? results.normalPlot.lineEnd.z : null,
        i === 0 ? results.normalPlot.lineStart.value : i === 1 ? results.normalPlot.lineEnd.value : null,
        results.normalPlot.lowerBand[i]?.z ?? null,
        results.normalPlot.lowerBand[i]?.value ?? null,
        results.normalPlot.upperBand[i]?.value ?? null,
      ]),
    });
    const plot = results.normalPlot;
    const [npXMin, npXMax] = paddedDomain(
      [
        ...np.map((point) => point.z),
        plot.lineStart.z,
        plot.lineEnd.z,
        ...plot.lowerBand.map((point) => point.z),
      ],
      PROBABILITY_PLOT_AXIS_PAD
    );
    const [npYMin, npYMax] = paddedDomain(
      [
        ...np.map((point) => point.value),
        plot.lineStart.value,
        plot.lineEnd.value,
        ...plot.lowerBand.map((point) => point.value),
        ...plot.upperBand.map((point) => point.value),
      ],
      PROBABILITY_PLOT_AXIS_PAD
    );
    charts.push({
      title: `${title} — Normal Probability Plot`,
      kind: "scatter",
      xAxisTitle: "Normal score",
      yAxisTitle: config.columnName,
      xMin: npXMin,
      xMax: npXMax,
      yMin: npYMin,
      yMax: npYMax,
      xMajorUnit: midpointMajorUnit(npXMin, npXMax),
      yMajorUnit: midpointMajorUnit(npYMin, npYMax),
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
          color: colors.brand600,
          scatterStyle: "line",
          marker: false,
        },
        // Excel cannot shade between two scatter series, so the band the panel
        // fills becomes its two boundary lines.
        {
          name: "CI low",
          tableId: "normal-plot",
          xCol: 4,
          valCol: 5,
          color: colors.brand400,
          scatterStyle: "line",
          marker: false,
        },
        {
          name: "CI high",
          tableId: "normal-plot",
          xCol: 4,
          valCol: 6,
          color: colors.brand400,
          scatterStyle: "line",
          marker: false,
        },
      ],
      subtitle: `AD: ${formatStat(plot.ad, 3)}   P: ${formatPValue(plot.pValue)}`,
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
  const showOverall =
    showDistributionLines && histogram.overallCurve.length > 0;
  const showWithin =
    showDistributionLines && histogram.withinCurve.length > 0;
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
      color: colors.brand200,
      borderColor: colors.brand500,
    },
  ];
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
        color: colors.axis,
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
      valueLabel: limitLabel(lsl, 1, "t", colors.limit),
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
      valueLabel: limitLabel(usl, 1, "t", colors.limit),
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
        yMajorUnit:
          scale.yTicks.length > 1
            ? scale.yTicks[1]! - scale.yTicks[0]!
            : undefined,
        gapWidth: 0,
        overlap: 100,
        forceCategoryAxis: true,
        showLegend: false,
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
  const [yMin, yMax] = paddedDomain(
    groups.flatMap((group) => [group.ciLow, group.ciHigh, group.mean]),
    ANOVA_AXIS_PAD
  );
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
        yMin,
        yMax,
        yMajorUnit: midpointMajorUnit(yMin, yMax),
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

/**
 * Tukey boxes drawn the way Excel can: an invisible column up to Q1, then the
 * Q1-median and median-Q3 segments stacked on top of it (their shared edge is
 * the median line), whiskers as custom error bars off the hidden base and the
 * top segment, and outliers as marker-only line series with star glyphs.
 *
 * Stacking works from the zero baseline, so a negative Q1 would flip a segment
 * to the wrong side. Those fall back to plotting the five statistics as points.
 */
function boxplotCharts(
  analysis: Extract<StatisticalAnalysisSummary, { kind: "boxplot" }>,
  colors: ReturnType<typeof chartBrandColors>
): AnalysisChartSource {
  const groups = analysis.results.groups;
  if (groups.length === 0) return { tables: [], charts: [] };
  const yWindow = boxplotYExtent(groups);
  const axis = {
    yMin: yWindow.min,
    yMax: yWindow.max,
    yMajorUnit: boxplotTickStep(yWindow.min, yWindow.max),
  };
  const xAxisTitle =
    analysis.config.categoryColumnNames.join(", ") || undefined;
  const label = (group: (typeof groups)[number]) =>
    group.labels.join(" / ") || "All";

  if (groups.some((group) => group.q1 < 0)) {
    const rows = groups.map((group) => [
      label(group),
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
    return {
      tables: [
        {
          id: "boxplot",
          title: "Boxplot data",
          headers: ["Group", "Whisker low", "Q1", "Median", "Q3", "Whisker high", "Mean"],
          rows,
        },
      ],
      charts: [
        {
          title: analysis.title,
          kind: "line",
          xAxisTitle,
          yAxisTitle: analysis.config.yColumnName,
          ...axis,
          series,
        },
      ],
    };
  }

  const outlierSlots = Math.min(
    MAX_PLOTTED_OUTLIERS,
    Math.max(0, ...groups.map((group) => group.outliers.length))
  );
  const { gapWidth, padLeft, padRight } = boxplotExcelLayout(groups.length);
  const headers = [
    "Group",
    "Q1",
    "Q1 to median",
    "Median to Q3",
    "Lower whisker",
    "Upper whisker",
    "Mean",
    ...Array.from({ length: outlierSlots }, (_, i) => `Outlier ${i + 1}`),
  ];
  const spacerRow = (): Array<string | number | null> => [
    BOXPLOT_EXCEL_SPACER,
    ...Array.from({ length: headers.length - 1 }, () => null),
  ];
  const groupRow = (
    group: (typeof groups)[number]
  ): Array<string | number | null> => [
    label(group),
    group.q1,
    Math.max(0, group.median - group.q1),
    Math.max(0, group.q3 - group.median),
    Math.max(0, group.q1 - group.whiskerLow),
    Math.max(0, group.whiskerHigh - group.q3),
    group.mean,
    ...Array.from(
      { length: outlierSlots },
      (_, i) => group.outliers[i] ?? null
    ),
  ];
  const rows: Array<Array<string | number | null>> = [
    ...Array.from({ length: padLeft }, spacerRow),
    ...groups.map(groupRow),
    ...Array.from({ length: padRight }, spacerRow),
  ];

  const boxFill = colors.brand400;
  const series: SeriesRef[] = [
    {
      name: "Q1",
      tableId: "boxplot",
      catCol: 0,
      valCol: 1,
      color: boxFill,
      hiddenFill: true,
      errMinusCol: 4,
      errColor: colors.brand800,
    },
    {
      name: "Q1 to median",
      tableId: "boxplot",
      catCol: 0,
      valCol: 2,
      color: boxFill,
      fillOpacity: BOX_FILL_OPACITY,
      borderColor: colors.brand600,
    },
    {
      name: "Median to Q3",
      tableId: "boxplot",
      catCol: 0,
      valCol: 3,
      color: boxFill,
      fillOpacity: BOX_FILL_OPACITY,
      borderColor: colors.brand600,
      errPlusCol: 5,
      errColor: colors.brand800,
    },
  ];
  if (analysis.config.showMeanLine) {
    series.push({
      name: "Mean",
      tableId: "boxplot",
      catCol: 0,
      valCol: 6,
      color: colors.brand600,
      marker: true,
      asLine: true,
    });
  }
  for (let i = 0; i < outlierSlots; i += 1) {
    series.push({
      name: `Outlier ${i + 1}`,
      tableId: "boxplot",
      catCol: 0,
      valCol: 7 + i,
      color: colors.brand800,
      marker: true,
      markerSymbol: "star",
      noLine: true,
      asLine: true,
    });
  }

  return {
    tables: [
      { id: "boxplot", title: "Boxplot data", headers, rows },
    ],
    charts: [
      {
        title: analysis.title,
        kind: "columnStackedLine",
        xAxisTitle,
        yAxisTitle: analysis.config.yColumnName,
        ...axis,
        gapWidth,
        overlap: 100,
        forceCategoryAxis: true,
        categoryAsText: true,
        showLegend: false,
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
