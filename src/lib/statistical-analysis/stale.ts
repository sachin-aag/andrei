import { formatRowSelection, normalizeRowSelection } from "./row-selection";
import { isAnovaAnalysis, isScatterAnalysis, isSixpackAnalysis } from "./types";
import type {
  AnovaAnalysisSummary,
  ScatterAnalysisSummary,
  StatisticalAnalysisSummary,
  WorksheetData,
} from "./types";
import { analysisSourceKey, anovaSourceKey, findColumn } from "./worksheet";
import { formatSpecSummary } from "./format";
import { formatChartProvenance } from "@/lib/charts/chart-spec";

export function withLocalStale(
  analyses: StatisticalAnalysisSummary[],
  worksheet: WorksheetData,
  persisted: WorksheetData
): StatisticalAnalysisSummary[] {
  return analyses.map((analysis) => {
    if (isScatterAnalysis(analysis)) return analysis;
    if (isAnovaAnalysis(analysis)) {
      return withAnovaLocalStale(analysis, worksheet, persisted);
    }
    if (!isSixpackAnalysis(analysis)) {
      const exhaustive: never = analysis;
      return exhaustive;
    }
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

function withAnovaLocalStale(
  analysis: AnovaAnalysisSummary,
  worksheet: WorksheetData,
  persisted: WorksheetData
): AnovaAnalysisSummary {
  const currentResponse = findColumn(worksheet, analysis.config.responseColumnId);
  const currentFactor = findColumn(worksheet, analysis.config.factorColumnId);
  if (!currentResponse || !currentFactor) {
    return { ...analysis, stale: true };
  }
  const savedResponse = findColumn(persisted, analysis.config.responseColumnId);
  const savedFactor = findColumn(persisted, analysis.config.factorColumnId);
  if (!savedResponse || !savedFactor) return analysis;
  const selection = normalizeRowSelection(analysis.config);
  const changed =
    anovaSourceKey(currentResponse, currentFactor, selection) !==
    anovaSourceKey(savedResponse, savedFactor, selection);
  return { ...analysis, stale: analysis.stale || changed };
}

export function analysisListSubtitle(analysis: StatisticalAnalysisSummary): string {
  if (isScatterAnalysis(analysis)) {
    return scatterListSubtitle(analysis);
  }
  if (isAnovaAnalysis(analysis)) {
    return anovaListSubtitle(analysis);
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

function anovaListSubtitle(analysis: AnovaAnalysisSummary): string {
  const rows = formatRowSelection(normalizeRowSelection(analysis.config));
  return [
    `${analysis.config.responseColumnName} by ${analysis.config.factorColumnName}`,
    rows,
    "One-way ANOVA",
  ]
    .filter(Boolean)
    .join(" · ");
}
