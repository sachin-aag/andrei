import { createHash } from "node:crypto";
import type { AnalysisRowSelection } from "./row-selection";
import { analysisSourceKey, anovaSourceKey, boxplotSourceKey, xyScatterSourceKey } from "./worksheet";
import { timeSeriesSourceKey } from "./time-series";
import type { MeasurementScatterResult, WorksheetColumn } from "./types";

export function hashColumnSource(
  column: WorksheetColumn,
  selection: AnalysisRowSelection = { mode: "all" }
): string {
  return createHash("sha256")
    .update(analysisSourceKey(column, selection))
    .digest("hex");
}

export function scatterSourceKey(
  query: string,
  result: MeasurementScatterResult
): string {
  const points = result.specs.flatMap((spec) =>
    spec.points.map((point) => [point.series ?? "", point.label, point.y])
  );
  const limits = result.specs[0]?.limits ?? { lower: null, upper: null };
  return JSON.stringify({
    query,
    n: result.n,
    uom: result.uom,
    limits,
    points,
  });
}

export function hashScatterSource(
  query: string,
  result: MeasurementScatterResult
): string {
  return createHash("sha256").update(scatterSourceKey(query, result)).digest("hex");
}

export function hashAnovaSource(
  response: WorksheetColumn,
  factor: WorksheetColumn,
  selection: AnalysisRowSelection = { mode: "all" }
): string {
  return createHash("sha256")
    .update(anovaSourceKey(response, factor, selection))
    .digest("hex");
}

export function hashXyScatterSource(
  xColumn: WorksheetColumn | null,
  yColumn: WorksheetColumn,
  selection: AnalysisRowSelection = { mode: "all" },
  legendColumn: WorksheetColumn | null = null
): string {
  return createHash("sha256")
    .update(xyScatterSourceKey(xColumn, yColumn, selection, legendColumn))
    .digest("hex");
}

export function hashBoxplotSource(
  yColumn: WorksheetColumn,
  categoryColumns: WorksheetColumn[],
  selection: AnalysisRowSelection = { mode: "all" }
): string {
  return createHash("sha256")
    .update(boxplotSourceKey(yColumn, categoryColumns, selection))
    .digest("hex");
}

export function hashTimeSeriesSource(
  column: WorksheetColumn,
  timeColumn: WorksheetColumn,
  clockColumn: WorksheetColumn | null,
  conditionColumn: WorksheetColumn | null,
  selection: AnalysisRowSelection = { mode: "all" }
): string {
  return createHash("sha256")
    .update(
      timeSeriesSourceKey(
        column,
        timeColumn,
        clockColumn,
        conditionColumn,
        selection
      )
    )
    .digest("hex");
}
