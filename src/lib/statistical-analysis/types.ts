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

export type AnalysisKind = typeof CAPABILITY_SIXPACK_NORMAL;

export type WorksheetColumn = {
  id: string;
  name: string;
  values: string[];
};

export type WorksheetData = {
  columns: WorksheetColumn[];
};

export type CapabilitySixpackConfig = {
  columnId: string;
  columnName: string;
  title: string;
  lsl: number | null;
  usl: number | null;
  target: number | null;
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

export type StatisticalAnalysisSummary = {
  id: string;
  workspaceId: string;
  kind: AnalysisKind;
  title: string;
  config: CapabilitySixpackConfig;
  results: CapabilitySixpackResult;
  sourceHash: string;
  stale: boolean;
  createdAt: string;
};

export type StatisticalWorkspaceSummary = {
  id: string;
  name: string;
  ownerId: string;
  analysisCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StatisticalWorkspaceView = {
  id: string;
  name: string;
  ownerId: string;
  worksheet: WorksheetData;
  analyses: StatisticalAnalysisSummary[];
  createdAt: string;
  updatedAt: string;
};
