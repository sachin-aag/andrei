import {
  DEFAULT_CHART_LAYOUT,
  type ChartPoint,
  type ChartSpec,
} from "@/lib/charts/chart-spec";
import type { AnalysisRowSelection } from "./row-selection";
import { normalizeRowSelection } from "./row-selection";
import {
  MIN_XY_POINTS,
  type WorksheetColumn,
  type WorksheetData,
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

function buildSpec(
  config: XyScatterConfig,
  points: ChartPoint[],
  limits: { lower: number | null; upper: number | null }
): ChartSpec {
  const query = `${config.yColumnName} vs ${config.xColumnName}`;
  return {
    version: 1,
    kind: "scatter",
    query,
    title: config.title,
    xLabel: config.xColumnName,
    yLabel: config.yColumnName,
    uom: "",
    limits,
    points,
    layout: {
      ...DEFAULT_CHART_LAYOUT,
      seriesBy: "none",
      xAxis: "value",
    },
    citations: [],
    sampleSizeMin: null,
  };
}

export function computeXyScatter(
  worksheet: WorksheetData,
  config: XyScatterConfig
): XyScatterComputeOutcome {
  const xColumn = findColumn(worksheet, config.xColumnId);
  const yColumn = findColumn(worksheet, config.yColumnId);
  if (!xColumn || !yColumn) {
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
      message: "X and Y must be different columns.",
    };
  }
  const xSheet = findSheetIdForColumn(worksheet, xColumn.id);
  const ySheet = findSheetIdForColumn(worksheet, yColumn.id);
  if (!xSheet || !ySheet || xSheet !== ySheet) {
    return {
      ok: false,
      code: "different_sheets",
      message: "X and Y must be on the same data sheet.",
    };
  }

  const selection = normalizeRowSelection(config);
  const xCells = cellsForRowSelection(xColumn, selection);
  const yCells = cellsForRowSelection(yColumn, selection);
  const rowCount = Math.max(xCells.length, yCells.length);
  const rowNumbers = rowNumbersForSelection(selection, rowCount);

  const points: ChartPoint[] = [];
  let skipped = 0;
  for (let i = 0; i < rowCount; i++) {
    const xRaw = xCells[i] ?? "";
    const yRaw = yCells[i] ?? "";
    if (xRaw.trim() === "" && yRaw.trim() === "") continue;
    const x = parseNumericCell(xRaw);
    const y = parseNumericCell(yRaw);
    if (x === null || y === null) {
      skipped += 1;
      continue;
    }
    points.push({
      x,
      y,
      series: null,
      label: `Row ${rowNumbers[i] ?? i + 1}`,
    });
  }

  if (points.length < MIN_XY_POINTS) {
    return {
      ok: false,
      code: "too_few_points",
      message: `Need at least ${MIN_XY_POINTS} paired numeric rows for an XY scatter.`,
    };
  }

  const result: XyScatterResult = {
    specs: [
      buildSpec(config, points, ySpecLimits(worksheet, yColumn.name)),
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
