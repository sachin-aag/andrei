import { IMR_CONSTANTS, MIN_HISTOGRAM_N, histogramFallbackTitle } from "./types";
import type {
  HistogramComputeOutcome,
  HistogramConfig,
  HistogramResult,
  WorksheetColumn,
  WorksheetData,
} from "./types";
import { histogramOverlays } from "./types";
import { normalizeRowSelection } from "./row-selection";
import { columnNumericValues, findColumn, specRowForColumn } from "./worksheet";
import { buildHistogram } from "./sixpack";

export type HistogramPatch = {
  columnId?: string;
  title?: string;
  lsl?: number | null;
  usl?: number | null;
  showDistributionLines?: boolean;
  showLsl?: boolean;
  showUsl?: boolean;
  rowStart?: number | null;
  rowEnd?: number | null;
  rows?: number[] | null;
};

export type ResolvedHistogramColumn =
  | { ok: true; column: WorksheetColumn }
  | { ok: false; code: "missing_column"; message: string };

function meanOf(values: number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function sampleStdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  let sumSq = 0;
  for (const value of values) {
    const d = value - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

function movingRanges(values: number[]): number[] {
  const ranges: number[] = [];
  for (let i = 1; i < values.length; i++) {
    ranges.push(Math.abs(values[i]! - values[i - 1]!));
  }
  return ranges;
}

function parseSpecNumber(raw: string | undefined): number | null {
  const text = raw?.trim() ?? "";
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Named LSL/USL on the column — not min/max of the selected rows. */
export function histogramLimitsFromColumnSpecs(
  worksheet: WorksheetData,
  columnName: string
): { lsl: number | null; usl: number | null } {
  const named = specRowForColumn(worksheet, columnName);
  if (!named) return { lsl: null, usl: null };
  return {
    lsl: parseSpecNumber(named.lsl),
    usl: parseSpecNumber(named.usl),
  };
}

function validateSpecs(config: HistogramConfig): HistogramComputeOutcome | null {
  const { lsl, usl } = config;
  if (lsl != null && usl != null && !(lsl < usl)) {
    return {
      ok: false,
      code: "invalid_specs",
      message: "Lower spec must be less than upper spec.",
    };
  }
  return null;
}

export function resolveHistogramColumn(
  worksheet: WorksheetData,
  input: { columnId?: string | null }
): ResolvedHistogramColumn {
  const columnId = input.columnId?.trim() ?? "";
  if (!columnId) {
    return {
      ok: false,
      code: "missing_column",
      message: "Select a worksheet column.",
    };
  }
  const column = findColumn(worksheet, columnId);
  if (!column) {
    return {
      ok: false,
      code: "missing_column",
      message: "The selected column was not found in the worksheet.",
    };
  }
  return { ok: true, column };
}

export function mergeHistogramPatch(
  existing: HistogramConfig,
  patch: HistogramPatch
): HistogramConfig {
  const overlays = histogramOverlays(existing);
  return {
    ...existing,
    columnId: patch.columnId ?? existing.columnId,
    lsl: patch.lsl !== undefined ? patch.lsl : existing.lsl,
    usl: patch.usl !== undefined ? patch.usl : existing.usl,
    showDistributionLines:
      patch.showDistributionLines ?? overlays.showDistributionLines,
    showLsl: patch.showLsl ?? overlays.showLsl,
    showUsl: patch.showUsl ?? overlays.showUsl,
    rowStart: patch.rowStart !== undefined ? patch.rowStart : existing.rowStart,
    rowEnd: patch.rowEnd !== undefined ? patch.rowEnd : existing.rowEnd,
    rows: patch.rows !== undefined ? patch.rows : existing.rows,
  };
}

export function histogramTitleFromColumn(
  columnName: string,
  rowLabel: string
): string {
  return histogramFallbackTitle(columnName.trim() || "Column", rowLabel);
}

export function computeHistogramFromValues(
  values: number[],
  skipped: number,
  config: HistogramConfig
): HistogramComputeOutcome {
  const specError = validateSpecs(config);
  if (specError) return specError;
  if (values.length < MIN_HISTOGRAM_N) {
    return {
      ok: false,
      code: "too_few_values",
      message: `Need at least ${MIN_HISTOGRAM_N} numeric observation in the selected data.`,
    };
  }

  const mean = meanOf(values);
  const overallStdev = sampleStdev(values, mean);
  const ranges = values.length >= 2 ? movingRanges(values) : [];
  const mrBar = ranges.length > 0 ? meanOf(ranges) : 0;
  const withinStdev = mrBar === 0 ? overallStdev : mrBar / IMR_CONSTANTS.d2;

  const result: HistogramResult = {
    n: values.length,
    skipped,
    mean,
    overallStdev,
    withinStdev,
    histogram: buildHistogram(
      values,
      mean,
      overallStdev,
      withinStdev,
      config.lsl,
      config.usl
    ),
  };

  return { ok: true, result };
}

export function computeHistogram(
  worksheet: WorksheetData,
  config: HistogramConfig
): HistogramComputeOutcome {
  const resolved = resolveHistogramColumn(worksheet, config);
  if (!resolved.ok) {
    return {
      ok: false,
      code: "too_few_values",
      message: resolved.message,
    };
  }
  const { values, skipped } = columnNumericValues(
    resolved.column,
    normalizeRowSelection(config)
  );
  return computeHistogramFromValues(values, skipped, config);
}
