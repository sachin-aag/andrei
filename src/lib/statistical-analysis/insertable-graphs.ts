import {
  BOXPLOT,
  CAPABILITY_SIXPACK_NORMAL,
  HISTOGRAM,
  MEASUREMENT_SCATTER,
  TIME_SERIES,
  XY_SCATTER,
  isBoxplotAnalysis,
  isHistogramAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isTimeSeriesAnalysis,
  isXyScatterAnalysis,
  type AnalysisKind,
  type StatisticalAnalysisSummary,
} from "./types";

export function isGraphAnalysisKind(kind: AnalysisKind): boolean {
  return (
    kind === CAPABILITY_SIXPACK_NORMAL ||
    kind === MEASUREMENT_SCATTER ||
    kind === XY_SCATTER ||
    kind === BOXPLOT ||
    kind === HISTOGRAM ||
    kind === TIME_SERIES
  );
}

export function listGraphAnalyses(
  analyses: StatisticalAnalysisSummary[]
): StatisticalAnalysisSummary[] {
  return analyses.filter((analysis) => isGraphAnalysisKind(analysis.kind));
}

/** Visual chart analyses that can be inserted into a document as a figure. */
export function isInsertableGraphAnalysis(
  analysis: StatisticalAnalysisSummary
): boolean {
  return (
    (isSixpackAnalysis(analysis) ||
      isScatterAnalysis(analysis) ||
      isXyScatterAnalysis(analysis) ||
      isBoxplotAnalysis(analysis) ||
      isHistogramAnalysis(analysis) ||
      isTimeSeriesAnalysis(analysis)) &&
    analysis.previewImage != null
  );
}

export function listInsertableGraphAnalyses(
  analyses: StatisticalAnalysisSummary[]
): StatisticalAnalysisSummary[] {
  return analyses.filter(isInsertableGraphAnalysis);
}
