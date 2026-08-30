import { parseChartMark } from "@/lib/charts/chart-marks";
import {
  DEFAULT_CHART_LAYOUT,
  uniqueChartCitations,
  type ChartPoint,
  type ChartSpec,
} from "@/lib/charts/chart-spec";
import type { AnalysisRowSelection } from "./row-selection";
import { normalizeRowSelection } from "./row-selection";
import {
  BLANK_LEGEND_LABEL,
  MAX_SCATTER_LEGEND_GROUPS,
  MIN_XY_POINTS,
  OBSERVATION_X_LABEL,
  xyScatterVersusLabel,
  type WorksheetColumn,
  type WorksheetData,
  type XyScatterComputeErrorCode,
  type XyScatterComputeOutcome,
  type XyScatterConfig,
  type XyScatterResult,
} from "./types";
import {
  cellsForRowSelection,
  columnNumericValues,
  dataSheets,
  findColumn,
  findSheetIdForColumn,
  parseNumericCell,
  specRowForColumn,
} from "./worksheet";

function pearsonR(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

function columnLooksNumeric(column: WorksheetColumn): boolean {
  const numeric = columnNumericValues(column);
  return numeric.values.length > numeric.skipped;
}

/** Next column on the same sheet, preferring a numeric neighbor. */
export function suggestXColumn(
  worksheet: WorksheetData,
  yColumnId: string
): string | null {
  const sheetId = findSheetIdForColumn(worksheet, yColumnId);
  const sheets = dataSheets(worksheet);
  const sheet =
    sheets.find((item) => item.id === sheetId) ?? sheets[0] ?? null;
  if (!sheet) return null;
  const index = sheet.columns.findIndex((column) => column.id === yColumnId);
  const others = sheet.columns.filter((column) => column.id !== yColumnId);
  if (others.length === 0) return null;
  const next = index >= 0 ? sheet.columns[index + 1] : undefined;
  if (next) return next.id;
  const prev = index > 0 ? sheet.columns[index - 1] : undefined;
  if (prev) return prev.id;
  const numeric = others.find(columnLooksNumeric);
  return numeric?.id ?? others[0]?.id ?? null;
}

function rowNumbersForSelection(
  selection: AnalysisRowSelection,
  cellCount: number
): number[] {
  switch (selection.mode) {
    case "all":
      return Array.from({ length: cellCount }, (_, index) => index + 1);
    case "range":
      return Array.from(
        { length: cellCount },
        (_, index) => selection.start + index
      );
    case "from":
      return Array.from(
        { length: cellCount },
        (_, index) => selection.start + index
      );
    case "rows":
      return selection.rows.slice(0, cellCount);
    default: {
      const exhaustive: never = selection;
      return exhaustive;
    }
  }
}

function ySpecLimits(
  worksheet: WorksheetData,
  yColumnName: string
): { lower: number | null; upper: number | null } {
  const spec = specRowForColumn(worksheet, yColumnName);
  return {
    lower: spec ? parseNumericCell(spec.lsl) : null,
    upper: spec ? parseNumericCell(spec.usl) : null,
  };
}

function legendLabel(raw: string | undefined): string {
  const text = raw?.trim() ?? "";
  return text.length > 0 ? text : BLANK_LEGEND_LABEL;
}

function uniqueSeriesCount(points: ChartPoint[]): number {
  const names = new Set<string>();
  for (const point of points) {
    if (point.series) names.add(point.series);
  }
  return names.size;
}

function citationsFromColumns(
  columns: Array<WorksheetColumn | null>
): ChartSpec["citations"] {
  return uniqueChartCitations(
    columns.flatMap((column) => column?.citations ?? [])
  );
}

function buildSpec(
  config: XyScatterConfig,
  points: ChartPoint[],
  limits: { lower: number | null; upper: number | null },
  citations: ChartSpec["citations"]
): ChartSpec {
  return {
    version: 1,
    kind: "scatter",
    query: xyScatterVersusLabel(config),
    title: config.title,
    xLabel: config.xColumnName,
    yLabel: config.yColumnName,
    uom: "",
    limits,
    points,
    layout: {
      ...DEFAULT_CHART_LAYOUT,
      seriesBy: config.legendColumnId ? "unit" : "none",
      xAxis: "value",
      mark: parseChartMark(config.mark),
      showSpecLimits: config.showSpecLimits === true,
    },
    citations,
    sampleSizeMin: null,
  };
}

export type ResolvedXyScatterColumns =
  | {
      ok: true;
      yColumn: WorksheetColumn;
      xColumn: WorksheetColumn | null;
      legendColumn: WorksheetColumn | null;
    }
  | {
      ok: false;
      code: Extract<
        XyScatterComputeErrorCode,
        "missing_columns" | "same_column" | "different_sheets"
      >;
      message: string;
    };

function optionalColumnId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Partial worksheet-plot patch from chat or the Edit dialog. */
export type XyScatterPatch = {
  yColumnId?: string;
  xColumnId?: string | null;
  legendColumnId?: string | null;
  title?: string;
  mark?: XyScatterConfig["mark"];
  showSpecLimits?: boolean;
  rowStart?: number | null;
  rowEnd?: number | null;
  rows?: number[] | null;
};

/** Omitted patch fields keep the saved config. `xColumnId: null` clears X to observation index. */
export function mergeXyScatterPatch(
  existing: XyScatterConfig,
  patch: XyScatterPatch
): XyScatterPatch & { yColumnId: string } {
  const useRowPatch =
    patch.rowStart !== undefined ||
    patch.rowEnd !== undefined ||
    patch.rows !== undefined;
  return {
    yColumnId: patch.yColumnId ?? existing.yColumnId,
    xColumnId:
      patch.xColumnId !== undefined ? patch.xColumnId : existing.xColumnId,
    legendColumnId:
      patch.legendColumnId !== undefined
        ? patch.legendColumnId
        : (existing.legendColumnId ?? null),
    title: patch.title,
    mark: patch.mark ?? existing.mark,
    showSpecLimits:
      patch.showSpecLimits ?? existing.showSpecLimits === true,
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

export function resolveXyScatterColumns(
  worksheet: WorksheetData,
  config: {
    yColumnId: string;
    xColumnId?: string | null;
    legendColumnId?: string | null;
  }
): ResolvedXyScatterColumns {
  const yColumn = findColumn(worksheet, config.yColumnId);
  if (!yColumn) {
    return {
      ok: false,
      code: "missing_columns",
      message: "Select a Y column.",
    };
  }

  const ySheet = findSheetIdForColumn(worksheet, yColumn.id);
  const xColumnId = optionalColumnId(config.xColumnId);
  const legendColumnId = optionalColumnId(config.legendColumnId);

  let xColumn: WorksheetColumn | null = null;
  if (xColumnId) {
    xColumn = findColumn(worksheet, xColumnId) ?? null;
    if (!xColumn) {
      return {
        ok: false,
        code: "missing_columns",
        message: "Select an X column and a Y column.",
      };
    }
    if (xColumn.id === yColumn.id) {
      return {
        ok: false,
        code: "same_column",
        message: "X, Y, and legend must be different columns.",
      };
    }
    const xSheet = findSheetIdForColumn(worksheet, xColumn.id);
    if (!xSheet || !ySheet || xSheet !== ySheet) {
      return {
        ok: false,
        code: "different_sheets",
        message: "X, Y, and legend must be on the same data sheet.",
      };
    }
  }

  let legendColumn: WorksheetColumn | null = null;
  if (legendColumnId) {
    legendColumn = findColumn(worksheet, legendColumnId) ?? null;
    if (!legendColumn) {
      return {
        ok: false,
        code: "missing_columns",
        message: "Select a legend column that is on the same sheet.",
      };
    }
    if (
      legendColumn.id === yColumn.id ||
      (xColumn && legendColumn.id === xColumn.id)
    ) {
      return {
        ok: false,
        code: "same_column",
        message: "X, Y, and legend must be different columns.",
      };
    }
    const legendSheet = findSheetIdForColumn(worksheet, legendColumn.id);
    if (!legendSheet || !ySheet || legendSheet !== ySheet) {
      return {
        ok: false,
        code: "different_sheets",
        message: "X, Y, and legend must be on the same data sheet.",
      };
    }
  }

  return { ok: true, yColumn, xColumn, legendColumn };
}

function scatterPoints(input: {
  yColumn: WorksheetColumn;
  xColumn: WorksheetColumn | null;
  legendColumn: WorksheetColumn | null;
  selection: AnalysisRowSelection;
}): { points: ChartPoint[]; skipped: number } {
  const yCells = cellsForRowSelection(input.yColumn, input.selection);
  const xCells = input.xColumn
    ? cellsForRowSelection(input.xColumn, input.selection)
    : null;
  const legendCells = input.legendColumn
    ? cellsForRowSelection(input.legendColumn, input.selection)
    : null;
  const rowCount = Math.max(
    yCells.length,
    xCells?.length ?? 0,
    legendCells?.length ?? 0
  );
  const rowNumbers = rowNumbersForSelection(input.selection, rowCount);
  const points: ChartPoint[] = [];
  let skipped = 0;
  for (let i = 0; i < rowCount; i++) {
    const yRaw = yCells[i] ?? "";
    const xRaw = xCells ? (xCells[i] ?? "") : "";
    if (xCells) {
      if (xRaw.trim() === "" && yRaw.trim() === "") continue;
      const x = parseNumericCell(xRaw);
      const y = parseNumericCell(yRaw);
      if (x === null || y === null) {
        skipped += 1;
        continue;
      }
      const row = rowNumbers[i] ?? i + 1;
      points.push({
        x,
        y,
        series: legendCells ? legendLabel(legendCells[i]) : null,
        label: `Row ${row}`,
      });
      continue;
    }
    if (yRaw.trim() === "") continue;
    const y = parseNumericCell(yRaw);
    if (y === null) {
      skipped += 1;
      continue;
    }
    const row = rowNumbers[i] ?? i + 1;
    points.push({
      x: row,
      y,
      series: legendCells ? legendLabel(legendCells[i]) : null,
      label: `Row ${row}`,
    });
  }
  return { points, skipped };
}

export function computeXyScatter(
  worksheet: WorksheetData,
  config: XyScatterConfig
): XyScatterComputeOutcome {
  const resolved = resolveXyScatterColumns(worksheet, config);
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code,
      message: resolved.message,
    };
  }

  const selection = normalizeRowSelection(config);
  const { points, skipped } = scatterPoints({
    yColumn: resolved.yColumn,
    xColumn: resolved.xColumn,
    legendColumn: resolved.legendColumn,
    selection,
  });

  if (points.length < MIN_XY_POINTS) {
    return {
      ok: false,
      code: "too_few_points",
      message: `Need at least ${MIN_XY_POINTS} numeric rows for a scatter.`,
    };
  }

  if (
    resolved.legendColumn &&
    uniqueSeriesCount(points) > MAX_SCATTER_LEGEND_GROUPS
  ) {
    return {
      ok: false,
      code: "too_many_series",
      message: `Legend supports at most ${MAX_SCATTER_LEGEND_GROUPS} groups. Use a coarser grouping column or a row range.`,
    };
  }

  const specConfig: XyScatterConfig = {
    ...config,
    xColumnId: resolved.xColumn?.id ?? null,
    xColumnName: resolved.xColumn?.name ?? OBSERVATION_X_LABEL,
    legendColumnId: resolved.legendColumn?.id ?? null,
    legendColumnName: resolved.legendColumn?.name ?? null,
  };
  const result: XyScatterResult = {
    specs: [
      buildSpec(
        specConfig,
        points,
        ySpecLimits(worksheet, resolved.yColumn.name),
        citationsFromColumns([
          resolved.yColumn,
          resolved.xColumn,
          resolved.legendColumn,
        ])
      ),
    ],
    n: points.length,
    skipped,
    pearsonR: pearsonR(
      points.map((point) => point.x),
      points.map((point) => point.y)
    ),
  };
  return { ok: true, result };
}
