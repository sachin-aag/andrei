import {
  BOXPLOT,
  CAPABILITY_SIXPACK_NORMAL,
  MEASUREMENT_SCATTER,
  XY_SCATTER,
  isBoxplotAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type AnalysisKind,
  type StatisticalAnalysisSummary,
} from "./types";

export function isGraphAnalysisKind(kind: AnalysisKind): boolean {
  return (
    kind === CAPABILITY_SIXPACK_NORMAL ||
    kind === MEASUREMENT_SCATTER ||
    kind === XY_SCATTER ||
    kind === BOXPLOT
  );
}

/** Visual chart analyses that can be inserted into a document as a figure. */
export function isInsertableGraphAnalysis(
  analysis: StatisticalAnalysisSummary
): boolean {
  return (
    (isSixpackAnalysis(analysis) ||
      isScatterAnalysis(analysis) ||
      isXyScatterAnalysis(analysis) ||
      isBoxplotAnalysis(analysis)) &&
    analysis.previewImage != null
  );
}

export function listInsertableGraphAnalyses(
  analyses: StatisticalAnalysisSummary[]
): StatisticalAnalysisSummary[] {
  return analyses.filter(isInsertableGraphAnalysis);
}
