import { formatRowSelection, normalizeRowSelection } from "./row-selection";
import {
  isAnovaAnalysis,
  isBoxplotAnalysis,
  isHistogramAnalysis,
  isObservationXyScatter,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  xyScatterVersusLabel,
  type AnovaAnalysisSummary,
  type BoxplotAnalysisSummary,
  type HistogramAnalysisSummary,
  type ScatterAnalysisSummary,
  type StatisticalAnalysisSummary,
  type WorksheetData,
  type XyScatterAnalysisSummary,
} from "./types";
import {
  analysisSourceKey,
  anovaSourceKey,
  boxplotSourceKey,
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
    if (isBoxplotAnalysis(analysis)) {
      return withBoxplotLocalStale(analysis, worksheet, persisted);
    }
    if (isHistogramAnalysis(analysis)) {
      return withHistogramLocalStale(analysis, worksheet, persisted);
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
  const currentY = findColumn(worksheet, analysis.config.yColumnId);
  if (!currentY) {
    return { ...analysis, stale: true };
  }
  const indexMode = isObservationXyScatter(analysis.config);
  const currentX = indexMode
    ? null
    : findColumn(worksheet, analysis.config.xColumnId ?? "") ?? null;
  if (!indexMode && !currentX) {
    return { ...analysis, stale: true };
  }
  const legendId = analysis.config.legendColumnId;
  const currentLegend = legendId
    ? findColumn(worksheet, legendId) ?? null
    : null;
  if (legendId && !currentLegend) {
    return { ...analysis, stale: true };
  }
  const savedY = findColumn(persisted, analysis.config.yColumnId);
  if (!savedY) return analysis;
  const savedX = indexMode
    ? null
    : findColumn(persisted, analysis.config.xColumnId ?? "") ?? null;
  if (!indexMode && !savedX) return analysis;
  const savedLegend = legendId
    ? findColumn(persisted, legendId) ?? null
    : null;
  if (legendId && !savedLegend) return analysis;
  const selection = normalizeRowSelection(analysis.config);
  const changed =
    xyScatterSourceKey(currentX, currentY, selection, currentLegend) !==
    xyScatterSourceKey(savedX, savedY, selection, savedLegend);
  return { ...analysis, stale: analysis.stale || changed };
}

function withBoxplotLocalStale(
  analysis: BoxplotAnalysisSummary,
  worksheet: WorksheetData,
  persisted: WorksheetData
): BoxplotAnalysisSummary {
  const currentY = findColumn(worksheet, analysis.config.yColumnId);
  const currentCategories = analysis.config.categoryColumnIds.map(
    (id) => findColumn(worksheet, id) ?? null
  );
  if (!currentY || currentCategories.some((column) => column == null)) {
    return { ...analysis, stale: true };
  }
  const savedY = findColumn(persisted, analysis.config.yColumnId);
  const savedCategories = analysis.config.categoryColumnIds.map(
    (id) => findColumn(persisted, id) ?? null
  );
  if (!savedY || savedCategories.some((column) => column == null)) {
    return analysis;
  }
  const selection = normalizeRowSelection(analysis.config);
  const currentKey = boxplotSourceKey(
    currentY,
    currentCategories.filter((column): column is NonNullable<typeof column> => column != null),
    selection
  );
  const savedKey = boxplotSourceKey(
    savedY,
    savedCategories.filter((column): column is NonNullable<typeof column> => column != null),
    selection
  );
  return { ...analysis, stale: analysis.stale || currentKey !== savedKey };
}

function withHistogramLocalStale(
  analysis: HistogramAnalysisSummary,
  worksheet: WorksheetData,
  persisted: WorksheetData
): HistogramAnalysisSummary {
  const current = findColumn(worksheet, analysis.config.columnId);
  const saved = findColumn(persisted, analysis.config.columnId);
  if (!current) return { ...analysis, stale: true };
  if (!saved) return analysis;
  const selection = normalizeRowSelection(analysis.config);
  const changed =
    analysisSourceKey(current, selection) !==
    analysisSourceKey(saved, selection);
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
  if (isBoxplotAnalysis(analysis)) {
    return boxplotListSubtitle(analysis);
  }
  if (isHistogramAnalysis(analysis)) {
    return histogramListSubtitle(analysis);
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
    xyScatterVersusLabel(analysis.config),
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

function boxplotListSubtitle(analysis: BoxplotAnalysisSummary): string {
  const rows = formatRowSelection(normalizeRowSelection(analysis.config));
  const by =
    analysis.config.categoryColumnNames.length > 0
      ? ` by ${analysis.config.categoryColumnNames.join(", ")}`
      : "";
  return [
    `${analysis.config.yColumnName}${by}`,
    rows,
    `${analysis.results.groups.length} box${analysis.results.groups.length === 1 ? "" : "es"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function histogramListSubtitle(analysis: HistogramAnalysisSummary): string {
  const specs = formatSpecSummary({
    lsl: analysis.config.lsl,
    usl: analysis.config.usl,
    target: null,
  });
  const rows = formatRowSelection(normalizeRowSelection(analysis.config));
  return [analysis.config.columnName, rows, specs, "Histogram"]
    .filter(Boolean)
    .join(" · ");
}
