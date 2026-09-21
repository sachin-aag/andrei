import type { WorksheetColumn } from "./types";

/**
 * What a worksheet column *is*, inferred from its cells.
 *
 * Plot tools need to know which column is the clock, which is the measurement
 * and which carries the acceptance condition. Asking the model to pick is
 * unreliable and unverifiable; asking the engineer to pick four columns before
 * anything is drawn is tedious. The cells already say: a date column parses as
 * dates, a measurement varies almost every row, and a setpoint is numeric but
 * takes a handful of values and holds each one for a long run.
 *
 * Nothing here knows what a lyophilizer is. The same shapes describe a
 * stability study (timepoint as the condition), a multi-grade line (grade), or
 * a chart recorder with one channel and no condition at all.
 */

export type WorksheetColumnRole =
  | "timestamp"
  | "date"
  | "clock"
  | "measurement"
  | "setpoint"
  | "category"
  | "label"
  | "empty";

export type ColumnRoleGuess = {
  columnId: string;
  name: string;
  index: number;
  role: WorksheetColumnRole;
  /** Share of sampled cells that fit the role, 0–1. */
  confidence: number;
  filled: number;
  distinct: number;
};

/** Cells sampled per column. Enough to be sure, cheap on a 10,000-row sheet. */
const SAMPLE_LIMIT = 400;

/**
 * A setpoint takes few values and holds each. Above this many distinct values
 * it is a measurement however flat it looks.
 */
const SETPOINT_MAX_DISTINCT = 12;

/** And it must be far fewer values than rows, or it is just a short column. */
const SETPOINT_MAX_DISTINCT_SHARE = 0.25;

/** Text with few values is a grouping factor; with many it is a row label. */
const CATEGORY_MAX_DISTINCT = 24;

const DATE_RE = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/;
const CLOCK_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
const DATETIME_RE =
  /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})[ T]\d{1,2}:\d{2}(:\d{2})?$/;
const NUMBER_RE = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

type CellKind = "date" | "clock" | "datetime" | "number" | "text";

function cellKind(raw: string): CellKind {
  const value = raw.trim();
  if (DATETIME_RE.test(value)) return "datetime";
  if (DATE_RE.test(value)) return "date";
  if (CLOCK_RE.test(value)) return "clock";
  if (NUMBER_RE.test(value)) return "number";
  return "text";
}

/** Evenly spread, so a column that changes character halfway is still seen. */
function sampleCells(values: readonly string[]): string[] {
  const filled = values.filter((value) => value.trim().length > 0);
  if (filled.length <= SAMPLE_LIMIT) return filled;
  const stride = Math.ceil(filled.length / SAMPLE_LIMIT);
  const sample: string[] = [];
  for (let i = 0; i < filled.length; i += stride) sample.push(filled[i]!);
  return sample;
}

export function inferColumnRole(
  column: WorksheetColumn,
  index: number
): ColumnRoleGuess {
  const sample = sampleCells(column.values);
  const base = {
    columnId: column.id,
    name: column.name,
    index,
    filled: sample.length,
    distinct: new Set(sample.map((value) => value.trim())).size,
  };
  if (sample.length === 0) {
    return { ...base, role: "empty", confidence: 1 };
  }

  const counts: Record<CellKind, number> = {
    date: 0,
    clock: 0,
    datetime: 0,
    number: 0,
    text: 0,
  };
  for (const cell of sample) counts[cellKind(cell)] += 1;

  const share = (kind: CellKind) => counts[kind] / sample.length;
  const distinctShare = base.distinct / sample.length;

  if (share("datetime") >= 0.9) {
    return { ...base, role: "timestamp", confidence: share("datetime") };
  }
  if (share("date") >= 0.9) {
    return { ...base, role: "date", confidence: share("date") };
  }
  if (share("clock") >= 0.9) {
    return { ...base, role: "clock", confidence: share("clock") };
  }
  if (share("number") >= 0.9) {
    const setpoint =
      base.distinct <= SETPOINT_MAX_DISTINCT &&
      distinctShare <= SETPOINT_MAX_DISTINCT_SHARE;
    return {
      ...base,
      role: setpoint ? "setpoint" : "measurement",
      confidence: share("number"),
    };
  }
  const category =
    base.distinct <= CATEGORY_MAX_DISTINCT &&
    distinctShare <= SETPOINT_MAX_DISTINCT_SHARE;
  return {
    ...base,
    role: category ? "category" : "label",
    confidence: share("text"),
  };
}

export function inferColumnRoles(
  columns: readonly WorksheetColumn[]
): ColumnRoleGuess[] {
  return columns.map((column, index) => inferColumnRole(column, index));
}

// ------------------------------------------------------------ name matching

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** `VAC1` and `VAC2` share the stem `vac`, which is how they pair up. */
function stem(name: string): string {
  return normalize(name).replace(/\s*\d+$/, "").trim();
}

/**
 * Does a free-text hint name this column? Handles "VAC1", "vac", and
 * "chamber vacuum" against a header of `VAC1` — an abbreviation is a prefix of
 * the word it abbreviates far more often than not.
 */
export function columnMatchesHint(name: string, hint: string): boolean {
  const columnKeys = [normalize(name), stem(name)].filter(Boolean);
  const hintNorm = normalize(hint);
  if (!hintNorm) return false;
  if (columnKeys.includes(hintNorm)) return true;
  const hintTokens = hintNorm.split(" ").filter(Boolean);
  for (const key of columnKeys) {
    if (!key) continue;
    if (hintNorm.includes(key) && key.length >= 3) return true;
    for (const token of hintTokens) {
      if (token === key) return true;
      if (key.length >= 3 && token.startsWith(key)) return true;
      if (token.length >= 3 && key.startsWith(token)) return true;
    }
  }
  return false;
}

// -------------------------------------------------------- time series picks

export type TimeSeriesColumnSuggestion = {
  columnId: string | null;
  timeColumnId: string | null;
  clockColumnId: string | null;
  conditionColumnId: string | null;
  /** Measurement columns that fit, when the hint did not narrow to one. */
  measurementCandidates: ColumnRoleGuess[];
  /** Distinct values of the chosen condition column, for band prompting. */
  conditionValues: string[];
  roles: ColumnRoleGuess[];
};

/**
 * Pick the columns a time series needs.
 *
 * The measurement is deliberately *not* guessed when several fit and the
 * engineer named none: picking one of nine instrument channels at random and
 * plotting it is worse than saying which nine are available.
 */
export function suggestTimeSeriesColumns(
  columns: readonly WorksheetColumn[],
  options: { measurementHint?: string } = {}
): TimeSeriesColumnSuggestion {
  const roles = inferColumnRoles(columns);
  const byRole = (role: WorksheetColumnRole) =>
    roles.filter((guess) => guess.role === role);

  const timestamp = byRole("timestamp")[0] ?? null;
  const date = byRole("date")[0] ?? null;
  const clock = byRole("clock")[0] ?? null;
  const time = timestamp ?? date;

  const measurements = byRole("measurement");
  const hint = options.measurementHint?.trim();
  const hinted = hint
    ? roles.filter(
        (guess) =>
          (guess.role === "measurement" || guess.role === "setpoint") &&
          columnMatchesHint(guess.name, hint)
      )
    : [];
  // A hint that matches both VAC1 and VAC2 means the channel, not its setpoint.
  const hintedMeasurement =
    hinted.find((guess) => guess.role === "measurement") ?? hinted[0] ?? null;

  const measurement =
    hintedMeasurement ?? (measurements.length === 1 ? measurements[0]! : null);

  const setpoints = byRole("setpoint");
  const condition = measurement
    ? (setpoints.find((guess) => stem(guess.name) === stem(measurement.name)) ??
      nearestByIndex(setpoints, measurement.index))
    : null;

  const conditionColumn = condition
    ? columns.find((column) => column.id === condition.columnId)
    : undefined;

  return {
    columnId: measurement?.columnId ?? null,
    timeColumnId: time?.columnId ?? null,
    // A clock column is only meaningful beside a date-only column.
    clockColumnId: time && time.role === "date" ? (clock?.columnId ?? null) : null,
    conditionColumnId: condition?.columnId ?? null,
    measurementCandidates: hinted.length > 1 ? hinted : measurements,
    conditionValues: conditionColumn
      ? [
          ...new Set(
            conditionColumn.values
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
          ),
        ].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
      : [],
    roles,
  };
}

function nearestByIndex(
  guesses: readonly ColumnRoleGuess[],
  index: number
): ColumnRoleGuess | null {
  let best: ColumnRoleGuess | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const guess of guesses) {
    const distance = Math.abs(guess.index - index);
    if (distance < bestDistance) {
      best = guess;
      bestDistance = distance;
    }
  }
  return best;
}
