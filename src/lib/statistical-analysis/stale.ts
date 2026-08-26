import { formatRowSelection, normalizeRowSelection } from "./row-selection";
import { isScatterAnalysis, isSixpackAnalysis } from "./types";
import type {
  ScatterAnalysisSummary,
  StatisticalAnalysisSummary,
  WorksheetData,
} from "./types";
import { analysisSourceKey, findColumn } from "./worksheet";
import { formatSpecSummary } from "./format";
import { formatChartProvenance } from "@/lib/charts/chart-spec";

export function withLocalStale(
  analyses: StatisticalAnalysisSummary[],
  worksheet: WorksheetData,
  persisted: WorksheetData
): StatisticalAnalysisSummary[] {
  return analyses.map((analysis) => {
    if (isScatterAnalysis(analysis)) return analysis;
    const current = findColumn(worksheet, analysis.config.columnId);
    const saved = findColumn(persisted, analysis.config.columnId);
    if (!current) return { ...analysis, stale: true };
    if (!saved) return analysis;
    const selection = normalizeRowSelection(analysis.config);
    const changed =
      analysisSourceKey(current, selection) !==
      analysisSourceKey(saved, selection);
    return { ...analysis, stale: analysis.stale || changed };
  });
}

export function analysisListSubtitle(analysis: StatisticalAnalysisSummary): string {
  if (isScatterAnalysis(analysis)) {
    return scatterListSubtitle(analysis);
  }
  if (!isSixpackAnalysis(analysis)) {
    const exhaustive: never = analysis;
    return exhaustive;
  }
  const specs = formatSpecSummary(analysis.config);
  const rows = formatRowSelection(normalizeRowSelection(analysis.config));
  return [analysis.config.columnName, rows, specs].filter(Boolean).join(" · ");
}

function scatterListSubtitle(analysis: ScatterAnalysisSummary): string {
  const spec = analysis.results.specs[0];
  if (spec) return formatChartProvenance(spec);
  const { query } = analysis.config;
  const { n, uom } = analysis.results;
  return `${query} · ${n} point${n === 1 ? "" : "s"}${uom ? ` ${uom}` : ""}`;
}
