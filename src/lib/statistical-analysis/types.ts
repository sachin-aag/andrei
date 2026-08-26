import type { ChartLayout, ChartSpec } from "@/lib/charts/chart-spec";

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

export type AnalysisKind =
  | typeof CAPABILITY_SIXPACK_NORMAL
  | typeof MEASUREMENT_SCATTER;

export const PRIMARY_DATA_SHEET_ID = "data-1";
export const SPECS_TAB_ID = "__specs__";
export const MAX_DATA_SHEETS = 12;

export type WorksheetColumn = {
  id: string;
  name: string;
  values: string[];
};

export type WorksheetSheet = {
  id: string;
  name: string;
  columns: WorksheetColumn[];
};

/** Spec limits for a data column, shown on the Specs tab. */
export type WorksheetSpecRow = {
  columnName: string;
  lsl: string;
  usl: string;
  target: string;
};

/**
 * One workbook per report. `columns` is the active data sheet (kept in
 * sync with `sheets`). `activeSheetId` is a data-sheet id or `SPECS_TAB_ID`.
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
};

export type MeasurementScatterResult = {
  specs: ChartSpec[];
  n: number;
  uom: string;
};

type AnalysisSummaryBase = {
  id: string;
  workspaceId: string;
  title: string;
  sourceHash: string;
  stale: boolean;
  createdAt: string;
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

export type StatisticalAnalysisSummary =
  | SixpackAnalysisSummary
  | ScatterAnalysisSummary;

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
  createdAt: string;
  updatedAt: string;
};
