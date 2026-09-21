import {
  MAX_TIME_SERIES_POINTS,
  MIN_TIME_SERIES_N,
  timeSeriesFallbackTitle,
  timeSeriesOverlays,
  type TimeSeriesBand,
  type TimeSeriesBandSegment,
  type TimeSeriesComputeOutcome,
  type TimeSeriesConfig,
  type TimeSeriesExcursion,
  type TimeSeriesPoint,
  type WorksheetColumn,
  type WorksheetData,
} from "./types";
import { normalizeRowSelection, type AnalysisRowSelection } from "./row-selection";
import type { ChartSpec } from "@/lib/charts/chart-spec";
import {
  cellsForRowSelection,
  findColumn,
  findSheet,
  findSheetIdForColumn,
  specRowForColumn,
} from "./worksheet";
import { suggestTimeSeriesColumns } from "./column-roles";
import {
  bandForRow,
  detectExcursions,
  elapsedMinutes,
  formatElapsed,
  parseInstrumentTimestamp,
  type ConditionalSpec,
  type Spec,
} from "./excursions";

/**
 * A measurement against a clock, with the out-of-band runs named.
 *
 * Every other analysis kind takes a numeric X, so none of them can plot a
 * timestamp. This one exists because an investigation's question is never
 * "what is the distribution" — it is "when did it leave the band, for how
 * long, and how far", and answering that from 15,000 printed readings by eye
 * is how a report ends up quoting four different durations for one excursion.
 *
 * Excursion detection is part of the computation rather than a separate
 * analysis kind: the plot and the table are two views of one result, and
 * splitting them would mean two `sourceHash` definitions that could disagree
 * about the same rows.
 */

export type TimeSeriesPatch = {
  columnId?: string;
  timeColumnId?: string;
  clockColumnId?: string | null;
  title?: string;
  lsl?: number | null;
  usl?: number | null;
  conditionColumnId?: string | null;
  bands?: TimeSeriesBand[] | null;
  showSpecLimits?: boolean;
  showExcursions?: boolean;
  rowStart?: number | null;
  rowEnd?: number | null;
  rows?: number[] | null;
};

/** `31/12/2026`, `2026-12-31`, and the same with a clock, all parse. */
export function parseTimestampCell(
  dateCell: string,
  clockCell?: string
): number | null {
  const date = dateCell.trim();
  if (!date) return null;
  const clock = clockCell?.trim() ?? "";

  // Instrument prints: dd/mm/yyyy in one column, HH:MM:SS in the next.
  const instrument = parseInstrumentTimestamp(date, clock || "00:00:00");
  if (instrument !== null) return instrument;

  // A single cell holding both, or an ISO date.
  const combined = clock ? `${date} ${clock}` : date;
  const isoLike = /^\d{4}-\d{2}-\d{2}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/.exec(
    combined.trim()
  );
  if (isoLike) {
    const ms = Date.parse(
      combined.trim().replace(" ", "T") +
        (isoLike[1] ? "" : "T00:00:00") +
        "Z"
    );
    return Number.isFinite(ms) ? ms : null;
  }

  // dd/mm/yyyy HH:MM:SS in one cell.
  const split = /^(\S+)\s+(\S+)$/.exec(combined.trim());
  if (split) {
    const parsed = parseInstrumentTimestamp(split[1]!, split[2]!);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseNumericCell(raw: string | undefined): number | null {
  const text = (raw ?? "").trim().replace(/,/g, "");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseSpecNumber(raw: string | undefined): number | null {
  const text = raw?.trim() ?? "";
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Named LSL/USL on the column — not min/max of the selected rows. */
export function timeSeriesLimitsFromColumnSpecs(
  worksheet: WorksheetData,
  columnName: string
): { lsl: number | null; usl: number | null } {
  const named = specRowForColumn(worksheet, columnName);
  if (!named) return { lsl: null, usl: null };
  return { lsl: parseSpecNumber(named.lsl), usl: parseSpecNumber(named.usl) };
}

export type ResolvedTimeSeriesColumns =
  | {
      ok: true;
      column: WorksheetColumn;
      timeColumn: WorksheetColumn;
      clockColumn: WorksheetColumn | null;
      conditionColumn: WorksheetColumn | null;
    }
  | { ok: false; code: "missing_column"; message: string };

export function resolveTimeSeriesColumns(
  worksheet: WorksheetData,
  input: {
    columnId?: string | null;
    timeColumnId?: string | null;
    clockColumnId?: string | null;
    conditionColumnId?: string | null;
  }
): ResolvedTimeSeriesColumns {
  const column = findColumn(worksheet, input.columnId?.trim() ?? "");
  if (!column) {
    return {
      ok: false,
      code: "missing_column",
      message: "Select the measurement column.",
    };
  }
  const timeColumn = findColumn(worksheet, input.timeColumnId?.trim() ?? "");
  if (!timeColumn) {
    return {
      ok: false,
      code: "missing_column",
      message: "Select the date or timestamp column.",
    };
  }
  const clockId = input.clockColumnId?.trim() ?? "";
  const clockColumn = clockId ? findColumn(worksheet, clockId) ?? null : null;
  if (clockId && !clockColumn) {
    return {
      ok: false,
      code: "missing_column",
      message: "The time-of-day column was not found in the worksheet.",
    };
  }
  const conditionId = input.conditionColumnId?.trim() ?? "";
  const conditionColumn = conditionId
    ? findColumn(worksheet, conditionId) ?? null
    : null;
  if (conditionId && !conditionColumn) {
    return {
      ok: false,
      code: "missing_column",
      message: "The setpoint / condition column was not found in the worksheet.",
    };
  }
  return { ok: true, column, timeColumn, clockColumn, conditionColumn };
}

function specFromConfig(config: TimeSeriesConfig): Spec {
  const bands = (config.bands ?? []).filter(
    (band) => band.lsl !== null || band.usl !== null
  );
  if (config.conditionColumnId && bands.length > 0) {
    const conditional: ConditionalSpec = {
      byColumn: config.conditionColumnName ?? "condition",
      bands: bands.map((band) => ({
        when: band.when,
        band: { lsl: band.lsl, usl: band.usl },
      })),
      ...(config.lsl !== null || config.usl !== null
        ? { fallback: { lsl: config.lsl, usl: config.usl } }
        : {}),
    };
    return conditional;
  }
  return { lsl: config.lsl, usl: config.usl };
}

/**
 * Keep the figure honest under decimation: every out-of-band reading and the
 * readings either side of it survive, along with the series ends. A uniform
 * stride fills the rest. A decimated plot that dropped the excursion would be
 * worse than no plot.
 */
function decimatePoints(
  points: readonly TimeSeriesPoint[],
  protectedIndices: ReadonlySet<number>
): { points: TimeSeriesPoint[]; decimated: boolean } {
  if (points.length <= MAX_TIME_SERIES_POINTS) {
    return { points: [...points], decimated: false };
  }
  const keep = new Set<number>([0, points.length - 1]);
  for (const index of protectedIndices) {
    keep.add(index);
    if (index > 0) keep.add(index - 1);
    if (index < points.length - 1) keep.add(index + 1);
  }
  const budget = Math.max(0, MAX_TIME_SERIES_POINTS - keep.size);
  if (budget > 0) {
    const stride = Math.max(2, Math.ceil(points.length / budget));
    for (let i = 0; i < points.length; i += stride) keep.add(i);
  }
  const kept = [...keep].sort((a, b) => a - b).map((index) => points[index]!);
  return { points: kept, decimated: true };
}

/**
 * Stretches of the x axis where one band was in force. With a fixed band this
 * is one segment spanning the series; with a conditional spec it is one per
 * run of the condition column, which is what lets the figure shade a band that
 * steps when the setpoint does.
 */
function bandSegments(
  points: readonly TimeSeriesPoint[],
  spec: Spec,
  conditions: readonly string[]
): TimeSeriesBandSegment[] {
  const segments: TimeSeriesBandSegment[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const condition = conditions[i] ?? "";
    const band = bandFor(spec, condition);
    const previous = segments.at(-1);
    if (
      previous &&
      previous.lsl === (band?.lsl ?? null) &&
      previous.usl === (band?.usl ?? null) &&
      previous.condition === (condition || null)
    ) {
      previous.to = points[i]!.t;
      continue;
    }
    segments.push({
      from: points[i]!.t,
      to: points[i]!.t,
      lsl: band?.lsl ?? null,
      usl: band?.usl ?? null,
      condition: condition || null,
    });
  }
  return segments.filter(
    (segment) => segment.lsl !== null || segment.usl !== null
  );
}

function bandFor(
  spec: Spec,
  condition: string
): { lsl: number | null; usl: number | null } | null {
  if (!("bands" in spec)) return spec;
  for (const entry of spec.bands) {
    const a = entry.when.trim();
    const b = condition.trim();
    if (a === b) return entry.band;
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn) && an === bn) {
      return entry.band;
    }
  }
  return spec.fallback ?? null;
}

export function computeTimeSeries(
  worksheet: WorksheetData,
  config: TimeSeriesConfig
): TimeSeriesComputeOutcome {
  const resolved = resolveTimeSeriesColumns(worksheet, config);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }
  if (
    config.lsl != null &&
    config.usl != null &&
    !(config.lsl < config.usl)
  ) {
    return {
      ok: false,
      code: "invalid_specs",
      message: "Lower spec must be less than upper spec.",
    };
  }

  const selection: AnalysisRowSelection = normalizeRowSelection(config);
  const values = cellsForRowSelection(resolved.column, selection);
  const dates = cellsForRowSelection(resolved.timeColumn, selection);
  const clocks = resolved.clockColumn
    ? cellsForRowSelection(resolved.clockColumn, selection)
    : [];
  const conditionCells = resolved.conditionColumn
    ? cellsForRowSelection(resolved.conditionColumn, selection)
    : [];
  const firstRow = selection.mode === "all" ? 1 : selectionFirstRow(selection);

  const points: TimeSeriesPoint[] = [];
  const conditions: string[] = [];
  let skipped = 0;
  const length = Math.max(values.length, dates.length);
  for (let i = 0; i < length; i += 1) {
    const value = parseNumericCell(values[i]);
    const t = parseTimestampCell(dates[i] ?? "", clocks[i]);
    if (value === null || t === null) {
      if ((values[i] ?? "").trim() || (dates[i] ?? "").trim()) skipped += 1;
      continue;
    }
    const clock = (clocks[i] ?? "").trim();
    points.push({
      t,
      label: clock ? `${(dates[i] ?? "").trim()} ${clock}` : (dates[i] ?? "").trim(),
      value,
      row: rowNumberFor(selection, firstRow, i),
    });
    conditions.push((conditionCells[i] ?? "").trim());
  }

  if (points.length < MIN_TIME_SERIES_N) {
    return {
      ok: false,
      code: points.length === 0 && skipped > 0 ? "unparsed_timestamps" : "too_few_values",
      message:
        points.length === 0 && skipped > 0
          ? "No row had both a number and a readable timestamp. Check the date and time columns."
          : `A time series needs at least ${MIN_TIME_SERIES_N} readings with a readable timestamp.`,
    };
  }

  // Readings are plotted in the order the instrument printed them; a sort
  // would hide a clock that stepped backwards, which is itself a finding.
  const spec = specFromConfig(config);
  const runs = detectExcursions({
    values: points.map((point) => point.value),
    labels: points.map((point) => point.label),
    timestamps: points.map((point) => point.t),
    conditions,
    spec,
  });

  const excursions: TimeSeriesExcursion[] = runs.map((run) => ({
    startLabel: run.startLabel ?? "",
    endLabel: run.endLabel ?? "",
    startRow: points[run.startIndex]?.row ?? 0,
    endRow: points[run.endIndex]?.row ?? 0,
    readings: run.readings,
    elapsedMs: run.elapsedMs,
    elapsedMinutes: elapsedMinutes(run),
    elapsedClock: formatElapsed(run.elapsedMs),
    min: run.min,
    max: run.max,
    direction: run.direction,
    lsl: run.band.lsl,
    usl: run.band.usl,
    condition: run.condition,
  }));

  const outOfBand = new Set<number>();
  for (const run of runs) {
    for (let i = run.startIndex; i <= run.endIndex; i += 1) outOfBand.add(i);
  }

  // A reading with no band in force was never judged. Counting these is what
  // lets the report distinguish "we checked and found none" from "we did not
  // check" — the difference between a finding and a fabricated pass.
  let judgedReadings = 0;
  for (let i = 0; i < points.length; i += 1) {
    const band = bandForRow(spec, conditions[i]);
    // A band with neither limit set judges nothing, so it does not count.
    if (band && (band.lsl !== null || band.usl !== null)) judgedReadings += 1;
  }

  const numbers = points.map((point) => point.value);
  const decimated = decimatePoints(points, outOfBand);
  const overlays = timeSeriesOverlays(config);
  const segments = overlays.showSpecLimits
    ? bandSegments(points, spec, conditions)
    : [];

  return {
    ok: true,
    result: {
      specs: [
        buildTimeSeriesSpec(config, decimated.points, segments, overlays),
      ],
      n: points.length,
      skipped,
      judgedReadings,
      points: decimated.points,
      decimated: decimated.decimated,
      start: points[0]!.t,
      end: points[points.length - 1]!.t,
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      mean: numbers.reduce((sum, value) => sum + value, 0) / numbers.length,
      excursions,
      excursionReadings: outOfBand.size,
      bandSegments: segments,
    },
  };
}

/**
 * Chart form of the series, so Excel export, the PNG fallback, and document
 * insert reuse the existing chart stack rather than a second renderer.
 *
 * `limits` can only hold one pair, so a conditional band is deliberately left
 * off here — drawing the first band as if it applied to the whole cycle would
 * assert limits that were not in force. The stepped band is in `bandSegments`
 * and is what the time-series view draws.
 */
function buildTimeSeriesSpec(
  config: TimeSeriesConfig,
  points: readonly TimeSeriesPoint[],
  segments: readonly TimeSeriesBandSegment[],
  overlays: { showSpecLimits: boolean }
): ChartSpec {
  const distinctBands = new Set(
    segments.map((segment) => `${segment.lsl}|${segment.usl}`)
  );
  const fixed = distinctBands.size === 1 ? segments[0] ?? null : null;
  return {
    version: 1,
    kind: "scatter",
    query: config.columnName,
    title: config.title,
    xLabel: config.timeColumnName,
    yLabel: config.columnName,
    uom: "",
    limits: {
      lower: fixed?.lsl ?? null,
      upper: fixed?.usl ?? null,
    },
    points: points.map((point) => ({
      x: point.t,
      y: point.value,
      series: null,
      label: point.label,
    })),
    layout: {
      mode: "combined",
      seriesBy: "none",
      xAxis: "value",
      xTickFormat: "time",
      yRange: null,
      xRange: null,
      // Sampled readings, not a continuous signal: connect them, do not smooth.
      mark: "line",
      showSpecLimits: overlays.showSpecLimits && fixed !== null,
      showMeanLine: false,
    },
    citations: [],
    sampleSizeMin: null,
  };
}

function selectionFirstRow(selection: AnalysisRowSelection): number {
  if (selection.mode === "range" || selection.mode === "from") {
    return selection.start;
  }
  if (selection.mode === "rows") return selection.rows[0] ?? 1;
  return 1;
}

function rowNumberFor(
  selection: AnalysisRowSelection,
  firstRow: number,
  index: number
): number {
  if (selection.mode === "rows") return selection.rows[index] ?? firstRow + index;
  return firstRow + index;
}

export function mergeTimeSeriesPatch(
  existing: TimeSeriesConfig,
  patch: TimeSeriesPatch
): TimeSeriesConfig {
  return {
    ...existing,
    columnId: patch.columnId ?? existing.columnId,
    timeColumnId: patch.timeColumnId ?? existing.timeColumnId,
    clockColumnId:
      patch.clockColumnId !== undefined
        ? patch.clockColumnId
        : existing.clockColumnId,
    lsl: patch.lsl !== undefined ? patch.lsl : existing.lsl,
    usl: patch.usl !== undefined ? patch.usl : existing.usl,
    conditionColumnId:
      patch.conditionColumnId !== undefined
        ? patch.conditionColumnId
        : existing.conditionColumnId,
    bands: patch.bands !== undefined ? patch.bands : existing.bands,
    showSpecLimits:
      patch.showSpecLimits !== undefined
        ? patch.showSpecLimits
        : existing.showSpecLimits,
    showExcursions:
      patch.showExcursions !== undefined
        ? patch.showExcursions
        : existing.showExcursions,
    title: patch.title ?? existing.title,
    rowStart: patch.rowStart !== undefined ? patch.rowStart : existing.rowStart,
    rowEnd: patch.rowEnd !== undefined ? patch.rowEnd : existing.rowEnd,
    rows: patch.rows !== undefined ? patch.rows : existing.rows,
  };
}

export { timeSeriesFallbackTitle };

/** Client-safe source key — do not import `hash.ts` from the browser. */
export function timeSeriesSourceKey(
  column: WorksheetColumn,
  timeColumn: WorksheetColumn,
  clockColumn: WorksheetColumn | null,
  conditionColumn: WorksheetColumn | null,
  selection: AnalysisRowSelection = { mode: "all" }
): string {
  return JSON.stringify({
    value: cellsForRowSelection(column, selection),
    time: cellsForRowSelection(timeColumn, selection),
    clock: clockColumn ? cellsForRowSelection(clockColumn, selection) : null,
    condition: conditionColumn
      ? cellsForRowSelection(conditionColumn, selection)
      : null,
  });
}

/**
 * The setpoint column beside this measurement, and the values it steps
 * through.
 *
 * Used for two different warnings, which is why it does not judge on its own:
 * a series plotted with no limits at all, and a series plotted against one
 * fixed band while its setpoint moves. The second is the subtler failure —
 * judging a whole lyophilization cycle against an overall 200–1000 µbar range
 * is not wrong, but RIG23001 sat at 844 µbar through a 380–620 step, inside
 * that range and a hundred minutes out of band.
 */
export function detectSetpointColumn(
  worksheet: WorksheetData,
  config: TimeSeriesConfig
): { columnName: string; values: string[] } | null {
  const sheetId = findSheetIdForColumn(worksheet, config.columnId);
  const sheet = sheetId ? findSheet(worksheet, sheetId) : undefined;
  const columns = sheet?.columns ?? worksheet.columns;
  const picks = suggestTimeSeriesColumns(columns, {
    measurementHint: config.columnName,
  });
  if (!picks.conditionColumnId) return null;
  // One value is a constant, not a schedule of steps.
  if (picks.conditionValues.length < 2) return null;

  const column = columns.find(
    (candidate) => candidate.id === picks.conditionColumnId
  );
  if (!column) return null;
  return { columnName: column.name, values: picks.conditionValues };
}

/**
 * A fixed band applied to a series whose setpoint steps. Null when the bands
 * are already conditional, or when there is no band to be wrong about — that
 * case is covered by `judgedReadings === 0`.
 */
export function steppedSetpointWarning(
  worksheet: WorksheetData,
  config: TimeSeriesConfig
): { columnName: string; values: string[] } | null {
  if (config.bands && config.bands.length > 0) return null;
  if (config.lsl == null && config.usl == null) return null;
  return detectSetpointColumn(worksheet, config);
}

/**
 * The runs worth reporting when there are too many to list, most severe first.
 *
 * Chronological order is right for reading a cycle and wrong for truncating
 * one. RIG23001 has 27 runs, 18 of them single readings of control noise, and
 * its hundred-minute excursion falls at position 26 — a first-N cap drops the
 * only one that matters and leaves a tidy list of blips.
 *
 * Duration ranks first because that is what an investigation asks about;
 * depth breaks ties, so a brief severe spike still outranks a brief mild one.
 */
export function rankExcursionsBySeverity(
  excursions: readonly TimeSeriesExcursion[]
): TimeSeriesExcursion[] {
  return [...excursions].sort((a, b) => {
    if (b.readings !== a.readings) return b.readings - a.readings;
    return depthOutsideBand(b) - depthOutsideBand(a);
  });
}

function depthOutsideBand(run: TimeSeriesExcursion): number {
  const below = run.lsl != null ? run.lsl - run.min : 0;
  const above = run.usl != null ? run.max - run.usl : 0;
  return Math.max(below, above, 0);
}

/** The single run an investigation leads with, or null when there were none. */
export function worstExcursion(
  excursions: readonly TimeSeriesExcursion[]
): TimeSeriesExcursion | null {
  return rankExcursionsBySeverity(excursions)[0] ?? null;
}
