import {
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type StatisticalAnalysisSummary,
} from "./types";

/** Visual chart analyses that can be inserted into a document as a figure. */
export function isInsertableGraphAnalysis(
  analysis: StatisticalAnalysisSummary
): boolean {
  return (
    isSixpackAnalysis(analysis) ||
    isScatterAnalysis(analysis) ||
    isXyScatterAnalysis(analysis)
  );
}

export function listInsertableGraphAnalyses(
  analyses: StatisticalAnalysisSummary[]
): StatisticalAnalysisSummary[] {
  return analyses.filter(isInsertableGraphAnalysis);
}
