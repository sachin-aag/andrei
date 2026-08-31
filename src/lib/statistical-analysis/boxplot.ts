import { suggestFactorColumn } from "./anova";
import { normalizeRowSelection } from "./row-selection";
import {
  BLANK_LEGEND_LABEL,
  MAX_BOXPLOT_CATEGORIES,
  MAX_BOXPLOT_GROUPS,
  MIN_BOXPLOT_N,
  boxplotFallbackTitle,
  type BoxplotComputeErrorCode,
  type BoxplotComputeOutcome,
  type BoxplotConfig,
  type BoxplotGroupStats,
  type BoxplotResult,
  type WorksheetColumn,
  type WorksheetData,
} from "./types";
import {
  cellsForRowSelection,
  dataSheets,
  findColumn,
  findSheetIdForColumn,
  parseNumericCell,
} from "./worksheet";

export type BoxplotCategorySpan = {
  label: string;
  startIndex: number;
  count: number;
};

export type BoxplotPatch = {
  yColumnId?: string;
  categoryColumnIds?: string[];
  title?: string;
  rowStart?: number | null;
  rowEnd?: number | null;
  rows?: number[] | null;
  xAxisLabel?: string | null;
  yAxisLabel?: string | null;
};

function mergeOptionalLabel(
  patch: string | null | undefined,
  existing: string | null | undefined
): string | null {
  if (patch !== undefined) {
    const trimmed = patch?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
  }
  return existing?.trim() ? existing.trim() : null;
}

export function boxplotYAxisLabel(config: BoxplotConfig): string {
  return config.yAxisLabel?.trim() || config.yColumnName;
}

export function boxplotXAxisLabel(config: BoxplotConfig): string | null {
  const custom = config.xAxisLabel?.trim();
  if (custom) return custom;
  const outermost =
    config.categoryColumnNames[config.categoryColumnNames.length - 1];
  return outermost?.trim() ? outermost : null;
}

export type ResolvedBoxplotColumns =
  | {
      ok: true;
      yColumn: WorksheetColumn;
      categoryColumns: WorksheetColumn[];
    }
  | {
      ok: false;
      code: BoxplotComputeErrorCode;
      message: string;
    };

function categoryLabel(raw: string | undefined): string {
  const text = raw?.trim() ?? "";
  return text.length > 0 ? text : BLANK_LEGEND_LABEL;
}

function groupKey(labels: string[]): string {
  return labels.join("\0");
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

/** R type 7 / Excel QUARTILE.INC interpolation on a sorted sample. */
export function quantileType7(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0]!;
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const gamma = pos - lo;
  return (1 - gamma) * sorted[lo]! + gamma * sorted[hi]!;
}

export function tukeyBoxStats(
  values: number[]
): Omit<BoxplotGroupStats, "labels"> {
  const sorted = [...values].toSorted((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0]!;
  const max = sorted[n - 1]!;
  const q1 = quantileType7(sorted, 0.25);
  const median = quantileType7(sorted, 0.5);
  const q3 = quantileType7(sorted, 0.75);
  const iqr = q3 - q1;
  const fenceLow = q1 - 1.5 * iqr;
  const fenceHigh = q3 + 1.5 * iqr;
  let whiskerLow = min;
  let whiskerHigh = max;
  for (const value of sorted) {
    if (value >= fenceLow) {
      whiskerLow = value;
      break;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    const value = sorted[i]!;
    if (value <= fenceHigh) {
      whiskerHigh = value;
      break;
    }
  }
  const outliers = sorted.filter(
    (value) => value < whiskerLow || value > whiskerHigh
  );
  return { n, min, q1, median, q3, max, whiskerLow, whiskerHigh, outliers };
}

export function nestedCategorySpans(
  groups: BoxplotGroupStats[],
  level: number
): BoxplotCategorySpan[] {
  const spans: BoxplotCategorySpan[] = [];
  for (let i = 0; i < groups.length; i++) {
    const label = groups[i]!.labels[level] ?? "";
    const last = spans[spans.length - 1];
    if (last && last.label === label) {
      last.count += 1;
    } else {
      spans.push({ label, startIndex: i, count: 1 });
    }
  }
  return spans;
}

/** Next unused column on the same sheet, preferring a factor-like neighbor. */
export function suggestCategoryColumn(
  worksheet: WorksheetData,
  yColumnId: string,
  alreadyUsed: string[] = []
): string | null {
  const used = new Set([yColumnId, ...alreadyUsed]);
  const suggested = suggestFactorColumn(worksheet, yColumnId);
  if (suggested && !used.has(suggested)) return suggested;
  const sheetId = findSheetIdForColumn(worksheet, yColumnId);
  const sheet = dataSheets(worksheet).find((item) => item.id === sheetId);
  if (!sheet) return null;
  return sheet.columns.find((column) => !used.has(column.id))?.id ?? null;
}

export function resolveBoxplotColumns(
  worksheet: WorksheetData,
  config: { yColumnId: string; categoryColumnIds?: string[] | null }
): ResolvedBoxplotColumns {
  const yColumn = findColumn(worksheet, config.yColumnId);
  if (!yColumn) {
    return {
      ok: false,
      code: "missing_columns",
      message: "Select a Y column.",
    };
  }
  const ySheet = findSheetIdForColumn(worksheet, yColumn.id);
  const categoryIds = uniqueIds(config.categoryColumnIds ?? []);
  if (categoryIds.length > MAX_BOXPLOT_CATEGORIES) {
    return {
      ok: false,
      code: "too_many_categories",
      message: `Use at most ${MAX_BOXPLOT_CATEGORIES} category columns.`,
    };
  }
  const categoryColumns: WorksheetColumn[] = [];
  for (const id of categoryIds) {
    if (id === yColumn.id) {
      return {
        ok: false,
        code: "same_column",
        message: "Y and category columns must be different.",
      };
    }
    const column = findColumn(worksheet, id);
    if (!column) {
      return {
        ok: false,
        code: "missing_columns",
        message: "Select category columns that are still on the worksheet.",
      };
    }
    const sheet = findSheetIdForColumn(worksheet, column.id);
    if (!ySheet || !sheet || sheet !== ySheet) {
      return {
        ok: false,
        code: "different_sheets",
        message: "Y and category columns must be on the same data sheet.",
      };
    }
    categoryColumns.push(column);
  }
  return { ok: true, yColumn, categoryColumns };
}

export function mergeBoxplotPatch(
  existing: BoxplotConfig,
  patch: BoxplotPatch
): BoxplotPatch & { yColumnId: string; categoryColumnIds: string[] } {
  const useRowPatch =
    patch.rowStart !== undefined ||
    patch.rowEnd !== undefined ||
    patch.rows !== undefined;
  return {
    yColumnId: patch.yColumnId ?? existing.yColumnId,
    categoryColumnIds:
      patch.categoryColumnIds !== undefined
        ? uniqueIds(patch.categoryColumnIds)
        : [...existing.categoryColumnIds],
    title: patch.title,
    xAxisLabel: mergeOptionalLabel(patch.xAxisLabel, existing.xAxisLabel),
    yAxisLabel: mergeOptionalLabel(patch.yAxisLabel, existing.yAxisLabel),
    ...(useRowPatch
      ? {
          rowStart: patch.rowStart,
          rowEnd: patch.rowEnd,
          rows: patch.rows,
        }
      : {
          rowStart: existing.rowStart,
          rowEnd: existing.rowEnd,
          rows: existing.rows,
        }),
  };
}

function sortGroupsNested(
  groups: BoxplotGroupStats[],
  firstSeenRanks: Array<Map<string, number>>
): BoxplotGroupStats[] {
  return groups.toSorted((a, b) => {
    for (let level = a.labels.length - 1; level >= 0; level--) {
      const rankA = firstSeenRanks[level]?.get(a.labels[level]!) ?? 0;
      const rankB = firstSeenRanks[level]?.get(b.labels[level]!) ?? 0;
      if (rankA !== rankB) return rankA - rankB;
    }
    return 0;
  });
}

export function computeBoxplot(
  worksheet: WorksheetData,
  config: BoxplotConfig
): BoxplotComputeOutcome {
  const resolved = resolveBoxplotColumns(worksheet, config);
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code,
      message: resolved.message,
    };
  }

  const selection = normalizeRowSelection(config);
  const yCells = cellsForRowSelection(resolved.yColumn, selection);
  const categoryCells = resolved.categoryColumns.map((column) =>
    cellsForRowSelection(column, selection)
  );
  const rowCount = Math.max(
    yCells.length,
    ...categoryCells.map((cells) => cells.length),
    0
  );

  const buckets = new Map<string, { labels: string[]; values: number[] }>();
  const firstSeenRanks = resolved.categoryColumns.map(
    () => new Map<string, number>()
  );
  let skipped = 0;

  for (let i = 0; i < rowCount; i++) {
    const y = parseNumericCell(yCells[i] ?? "");
    if (y == null) {
      skipped += 1;
      continue;
    }
    const labels = resolved.categoryColumns.map((_, level) => {
      const label = categoryLabel(categoryCells[level]?.[i]);
      const ranks = firstSeenRanks[level]!;
      if (!ranks.has(label)) ranks.set(label, ranks.size);
      return label;
    });
    const key = groupKey(labels);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.values.push(y);
    } else {
      buckets.set(key, { labels, values: [y] });
    }
  }

  if (buckets.size === 0) {
    return {
      ok: false,
      code: "too_few_values",
      message: "Need at least one numeric Y value to draw a boxplot.",
    };
  }
  if (buckets.size > MAX_BOXPLOT_GROUPS) {
    return {
      ok: false,
      code: "too_many_groups",
      message: `Too many groups (${buckets.size}). Use at most ${MAX_BOXPLOT_GROUPS} observed category combinations.`,
    };
  }

  const unsorted: BoxplotGroupStats[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.values.length < MIN_BOXPLOT_N) continue;
    unsorted.push({
      labels: bucket.labels,
      ...tukeyBoxStats(bucket.values),
    });
  }

  const groups = sortGroupsNested(unsorted, firstSeenRanks);
  const n = groups.reduce((sum, group) => sum + group.n, 0);
  const result: BoxplotResult = { n, skipped, groups };
  return { ok: true, result };
}

export function boxplotTitleFromColumns(
  yName: string,
  categoryNames: string[],
  rowLabel: string
): string {
  return boxplotFallbackTitle(yName.trim() || "Y", categoryNames, rowLabel);
}
