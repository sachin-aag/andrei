import type { ChartMark } from "@/lib/charts/chart-marks";
import type {
  ChartCitation,
  ChartLayout,
  ChartSpec,
} from "@/lib/charts/chart-spec";

export const MAX_WORKSHEET_COLUMNS = 50;
export const MAX_WORKSHEET_ROWS = 10_000;
export const MAX_CELL_LENGTH = 64;
export const MAX_COLUMN_NAME_LENGTH = 80;
export const MIN_VISIBLE_ROWS = 30;
export const MIN_VISIBLE_COLUMNS = 8;
export const MIN_VALUES_FOR_SIXPACK = 2;
export const WARN_VALUES_FOR_SIXPACK = 10;

/** Minitab I-MR constants for moving range of length 2. */
export const IMR_CONSTANTS = {
  d2: 1.128,
  D3: 0,
  D4: 3.267,
  E2: 2.66,
} as const;

export const CAPABILITY_SIXPACK_NORMAL = "capability_sixpack_normal" as const;
export const MEASUREMENT_SCATTER = "measurement_scatter" as const;
export const XY_SCATTER = "xy_scatter" as const;
export const ONE_WAY_ANOVA = "one_way_anova" as const;

export const MIN_ANOVA_GROUPS = 2;
export const MAX_ANOVA_GROUPS = 40;
export const MIN_XY_POINTS = 2;
export const MAX_SCATTER_LEGEND_GROUPS = 24;
/** X-axis label when a worksheet scatter has no second column (1D vs index). */
export const OBSERVATION_X_LABEL = "Observation";
/** Series name when a legend cell is empty. */
export const BLANK_LEGEND_LABEL = "(blank)";

export function isObservationXyScatter(config: {
  xColumnId?: string | null;
}): boolean {
  return config.xColumnId == null || config.xColumnId === "";
}

export function xyScatterVersusLabel(config: {
  yColumnName: string;
  xColumnName: string;
  xColumnId?: string | null;
  legendColumnId?: string | null;
  legendColumnName?: string | null;
}): string {
  const versus = isObservationXyScatter(config)
    ? `${config.yColumnName} vs ${OBSERVATION_X_LABEL}`
    : `${config.yColumnName} vs ${config.xColumnName}`;
  const legend =
    config.legendColumnId && config.legendColumnName
      ? ` by ${config.legendColumnName}`
      : "";
  return `${versus}${legend}`;
}

export function xyScatterFallbackTitle(
  yColumnName: string,
  xColumnName: string | null,
  rowLabel: string,
  legendColumnName?: string | null
): string {
  const versus = `${yColumnName} vs ${xColumnName ?? OBSERVATION_X_LABEL}`;
  const legend = legendColumnName ? ` by ${legendColumnName}` : "";
  const base = `${versus}${legend}`;
  return rowLabel ? `${base} (${rowLabel})` : base;
}

export type AnalysisKind =
  | typeof CAPABILITY_SIXPACK_NORMAL
  | typeof MEASUREMENT_SCATTER
  | typeof XY_SCATTER
  | typeof ONE_WAY_ANOVA;

export const PRIMARY_DATA_SHEET_ID = "data-1";
/** Legacy workbook tab id. Specs now live on the column (right-click header). */
export const SPECS_TAB_ID = "__specs__";
export const MAX_DATA_SHEETS = 12;

export type WorksheetColumn = {
  id: string;
  name: string;
  values: string[];
  /**
   * Attachment pages this column was written from (extract / table dump).
   * Omitted for typed or pasted values. Cleared when a human edits a cell.
   */
  citations?: ChartCitation[];
};

export type WorksheetSheet = {
  id: string;
  name: string;
  columns: WorksheetColumn[];
};

/** Spec limits for a data column (right-click the header to view/edit). */
export type WorksheetSpecRow = {
  columnName: string;
  lsl: string;
  usl: string;
  target: string;
};

/**
 * One workbook per report. `columns` is the active data sheet (kept in
 * sync with `sheets`). `activeSheetId` is a data-sheet id. Legacy
 * worksheets may still store `SPECS_TAB_ID`; normalize onto the first
 * data sheet.
 */
export type WorksheetData = {
  columns: WorksheetColumn[];
  sheets: WorksheetSheet[];
  specs: WorksheetSpecRow[];
  activeSheetId: string;
};

export type CapabilitySixpackConfig = {
  columnId: string;
  columnName: string;
  title: string;
  lsl: number | null;
  usl: number | null;
  target: number | null;
  /** 1-based inclusive. Null with `rowEnd` null means the whole column. */
  rowStart?: number | null;
  rowEnd?: number | null;
  /** Explicit 1-based row numbers. When set, overrides `rowStart`/`rowEnd`. */
  rows?: number[] | null;
};

export type ControlChartSeries = {
  values: number[];
  center: number;
  ucl: number;
  lcl: number;
  outOfControl: number[];
};

export type HistogramBin = {
  x0: number;
  x1: number;
  count: number;
};

export type CurvePoint = {
  x: number;
  y: number;
};

export type ProbabilityPlotPoint = {
  z: number;
  value: number;
};

export type CapabilityIndices = {
  lsl: number | null;
  usl: number | null;
  target: number | null;
  cp: number | null;
  cpk: number | null;
  cpl: number | null;
  cpu: number | null;
  pp: number | null;
  ppk: number | null;
  ppl: number | null;
  ppu: number | null;
  ppmWithin: number | null;
  ppmOverall: number | null;
  ppmObserved: number | null;
  withinLow: number;
  withinHigh: number;
  overallLow: number;
  overallHigh: number;
};

export type CapabilitySixpackResult = {
  n: number;
  skipped: number;
  mean: number;
  overallStdev: number;
  withinStdev: number;
  mrBar: number;
  individuals: ControlChartSeries;
  movingRange: ControlChartSeries;
  lastObservations: number[];
  histogram: {
    bins: HistogramBin[];
    overallCurve: CurvePoint[];
    withinCurve: CurvePoint[];
  };
  normalPlot: {
    points: ProbabilityPlotPoint[];
    lineStart: ProbabilityPlotPoint;
    lineEnd: ProbabilityPlotPoint;
    lowerBand: ProbabilityPlotPoint[];
    upperBand: ProbabilityPlotPoint[];
    ad: number;
    adStar: number;
    pValue: number;
  };
  capability: CapabilityIndices;
};

export type SixpackComputeErrorCode =
  | "too_few_values"
  | "zero_variance"
  | "invalid_specs";

export type SixpackComputeSuccess = {
  ok: true;
  result: CapabilitySixpackResult;
};

export type SixpackComputeFailure = {
  ok: false;
  code: SixpackComputeErrorCode;
  message: string;
};

export type SixpackComputeOutcome = SixpackComputeSuccess | SixpackComputeFailure;

export type MeasurementScatterLayoutInput = {
  mode?: "combined" | "per-series";
  seriesBy?: "unit" | "none";
  xAxis?: "sequential" | "replicate";
  yMax?: number;
};

export type MeasurementScatterConfig = {
  query: string;
  title: string;
  xLabel: string;
  yLabel: string;
  layout: ChartLayout;
  /** User override. Null keeps the limit extracted from attachments. */
  lsl: number | null;
  usl: number | null;
};

export type MeasurementScatterResult = {
  specs: ChartSpec[];
  n: number;
  uom: string;
};

export type AnalysisPreviewImage = {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  alt: string;
  chartSpec: ChartSpec | null;
};

type AnalysisSummaryBase = {
  id: string;
  workspaceId: string;
  title: string;
  sourceHash: string;
  stale: boolean;
  createdAt: string;
  /** Captured from the Analytics UI for document insert; null until opened (or after recompute). */
  previewImage: AnalysisPreviewImage | null;
};

export type SixpackAnalysisSummary = AnalysisSummaryBase & {
  kind: typeof CAPABILITY_SIXPACK_NORMAL;
  config: CapabilitySixpackConfig;
  results: CapabilitySixpackResult;
};

export type ScatterAnalysisSummary = AnalysisSummaryBase & {
  kind: typeof MEASUREMENT_SCATTER;
  config: MeasurementScatterConfig;
  results: MeasurementScatterResult;
};

export type OneWayAnovaConfig = {
  responseColumnId: string;
  responseColumnName: string;
  factorColumnId: string;
  factorColumnName: string;
  title: string;
  /** 1-based inclusive. Null with `rowEnd` null means the whole columns. */
  rowStart?: number | null;
  rowEnd?: number | null;
  /** Explicit 1-based row numbers. When set, overrides `rowStart`/`rowEnd`. */
  rows?: number[] | null;
  /** Two-sided family error rate for CIs and Bonferroni pairwise. Default 0.05. */
  alpha?: number;
};

export type AnovaSourceRow = {
  df: number;
  ss: number;
  ms: number;
  f: number;
  p: number;
};

export type AnovaErrorRow = {
  df: number;
  ss: number;
  ms: number;
};

export type AnovaTotalRow = {
  df: number;
  ss: number;
};

export type AnovaGroupStats = {
  label: string;
  n: number;
  mean: number;
  stdev: number;
  se: number;
  ciLow: number;
  ciHigh: number;
};

export type AnovaPairwiseRow = {
  groupA: string;
  groupB: string;
  diff: number;
  se: number;
  t: number;
  pUnadjusted: number;
  pBonferroni: number;
  significant: boolean;
};

export type OneWayAnovaResult = {
  n: number;
  skipped: number;
  groupCount: number;
  grandMean: number;
  alpha: number;
  table: {
    factor: AnovaSourceRow;
    error: AnovaErrorRow;
    total: AnovaTotalRow;
  };
  rSquared: number;
  groups: AnovaGroupStats[];
  pairwise: AnovaPairwiseRow[];
};

export type AnovaComputeErrorCode =
  | "too_few_groups"
  | "too_few_observations"
  | "too_many_groups"
  | "missing_columns"
  | "different_sheets"
  | "same_column"
  | "invalid_alpha";

export type AnovaComputeSuccess = {
  ok: true;
  result: OneWayAnovaResult;
};

export type AnovaComputeFailure = {
  ok: false;
  code: AnovaComputeErrorCode;
  message: string;
};

export type AnovaComputeOutcome = AnovaComputeSuccess | AnovaComputeFailure;

export type AnovaAnalysisSummary = AnalysisSummaryBase & {
  kind: typeof ONE_WAY_ANOVA;
  config: OneWayAnovaConfig;
  results: OneWayAnovaResult;
};

export type XyScatterConfig = {
  /** Null/empty means X is observation index (1D scatter). */
  xColumnId: string | null;
  xColumnName: string;
  yColumnId: string;
  yColumnName: string;
  /** Null/empty means one color, no legend. */
  legendColumnId?: string | null;
  legendColumnName?: string | null;
  title: string;
  /** 1-based inclusive. Null with `rowEnd` null means the whole columns. */
  rowStart?: number | null;
  rowEnd?: number | null;
  /** Explicit 1-based row numbers. When set, overrides `rowStart`/`rowEnd`. */
  rows?: number[] | null;
  /** Visual mark. Chat can set this on create or update. */
  mark?: ChartMark;
  /** Draw Y-column LSL/USL on the chart. Default off. */
  showSpecLimits?: boolean;
};

export type XyScatterResult = {
  specs: ChartSpec[];
  n: number;
  skipped: number;
  /** Pearson r. Null when n < 2 or either axis has zero variance. */
  pearsonR: number | null;
};

export type XyScatterComputeErrorCode =
  | "too_few_points"
  | "too_many_series"
  | "missing_columns"
  | "different_sheets"
  | "same_column";

export type XyScatterComputeSuccess = {
  ok: true;
  result: XyScatterResult;
};

export type XyScatterComputeFailure = {
  ok: false;
  code: XyScatterComputeErrorCode;
  message: string;
};

export type XyScatterComputeOutcome =
  | XyScatterComputeSuccess
  | XyScatterComputeFailure;

export type XyScatterAnalysisSummary = AnalysisSummaryBase & {
  kind: typeof XY_SCATTER;
  config: XyScatterConfig;
  results: XyScatterResult;
};

export type StatisticalAnalysisSummary =
  | SixpackAnalysisSummary
  | ScatterAnalysisSummary
  | XyScatterAnalysisSummary
  | AnovaAnalysisSummary;

export function isSixpackAnalysis(
  analysis: StatisticalAnalysisSummary
): analysis is SixpackAnalysisSummary {
  return analysis.kind === CAPABILITY_SIXPACK_NORMAL;
}

export function isScatterAnalysis(
  analysis: StatisticalAnalysisSummary
): analysis is ScatterAnalysisSummary {
  return analysis.kind === MEASUREMENT_SCATTER;
}

export function isAnovaAnalysis(
  analysis: StatisticalAnalysisSummary
): analysis is AnovaAnalysisSummary {
  return analysis.kind === ONE_WAY_ANOVA;
}

export function isXyScatterAnalysis(
  analysis: StatisticalAnalysisSummary
): analysis is XyScatterAnalysisSummary {
  return analysis.kind === XY_SCATTER;
}

/**
 * One analytics worksheet per report (1:1 with `statistical_workspaces`).
 * Saved sixpacks live in `analyses` — many per report, never overwritten
 * by a later run on the same column.
 */
export type ReportAnalyticsView = {
  id: string;
  reportId: string;
  worksheet: WorksheetData;
  analyses: StatisticalAnalysisSummary[];
  /** Monotonic worksheet revision; PATCH must send the last seen value. */
  version: number;
  createdAt: string;
  updatedAt: string;
};
