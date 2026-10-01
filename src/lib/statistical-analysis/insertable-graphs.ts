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

/**
 * Visual chart analyses that can be inserted into a document as a figure.
 *
 * Deliberately does not require `previewImage`. That field is captured from
 * the rendered DOM, so gating on it hid every plot nobody had opened —
 * including all of a batch created headlessly by chat. Each kind here also
 * renders server-side (the DOCX export path), and the image endpoint falls
 * back to that, so being a chart kind is the whole condition.
 */
export function isInsertableGraphAnalysis(
  analysis: StatisticalAnalysisSummary
): boolean {
  return (
    isSixpackAnalysis(analysis) ||
    isScatterAnalysis(analysis) ||
    isXyScatterAnalysis(analysis) ||
    isBoxplotAnalysis(analysis) ||
    isHistogramAnalysis(analysis) ||
    isTimeSeriesAnalysis(analysis)
  );
}

export function listInsertableGraphAnalyses(
  analyses: StatisticalAnalysisSummary[]
): StatisticalAnalysisSummary[] {
  return analyses.filter(isInsertableGraphAnalysis);
}
