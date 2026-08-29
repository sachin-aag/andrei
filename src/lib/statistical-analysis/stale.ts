import { formatRowSelection, normalizeRowSelection } from "./row-selection";
import {
  isAnovaAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
} from "./types";
import type {
  AnovaAnalysisSummary,
  ScatterAnalysisSummary,
  StatisticalAnalysisSummary,
  WorksheetData,
  XyScatterAnalysisSummary,
} from "./types";
import {
  analysisSourceKey,
  anovaSourceKey,
  findColumn,
  xyScatterSourceKey,
} from "./worksheet";
import { formatSpecSummary, formatStat } from "./format";
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
    if (isXyScatterAnalysis(analysis)) {
      return withXyScatterLocalStale(analysis, worksheet, persisted);
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

function withXyScatterLocalStale(
  analysis: XyScatterAnalysisSummary,
  worksheet: WorksheetData,
  persisted: WorksheetData
): XyScatterAnalysisSummary {
  const currentX = findColumn(worksheet, analysis.config.xColumnId);
  const currentY = findColumn(worksheet, analysis.config.yColumnId);
  if (!currentX || !currentY) {
    return { ...analysis, stale: true };
  }
  const savedX = findColumn(persisted, analysis.config.xColumnId);
  const savedY = findColumn(persisted, analysis.config.yColumnId);
  if (!savedX || !savedY) return analysis;
  const selection = normalizeRowSelection(analysis.config);
  const changed =
    xyScatterSourceKey(currentX, currentY, selection) !==
    xyScatterSourceKey(savedX, savedY, selection);
  return { ...analysis, stale: analysis.stale || changed };
}

export function analysisListSubtitle(analysis: StatisticalAnalysisSummary): string {
  if (isScatterAnalysis(analysis)) {
    return scatterListSubtitle(analysis);
  }
  if (isXyScatterAnalysis(analysis)) {
    return xyScatterListSubtitle(analysis);
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

function xyScatterListSubtitle(analysis: XyScatterAnalysisSummary): string {
  const rows = formatRowSelection(normalizeRowSelection(analysis.config));
  const r =
    analysis.results.pearsonR == null
      ? null
      : `r ${formatStat(analysis.results.pearsonR, 3)}`;
  return [
    `${analysis.config.yColumnName} vs ${analysis.config.xColumnName}`,
    rows,
    `${analysis.results.n} point${analysis.results.n === 1 ? "" : "s"}`,
    r,
  ]
    .filter(Boolean)
    .join(" · ");
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
