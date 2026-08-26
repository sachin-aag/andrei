/**
 * Fail-closed guards so dual unlabeled assay columns (e.g. Conductivity + TOC)
 * cannot be collapsed into one extracted series.
 */

export const AMBIGUOUS_METRIC_REQUEST_MESSAGE =
  "Name exactly one measurement series (for example Conductivity or TOC), not both. Use ask_user if the engineer did not specify.";

export const UNBOUND_DUAL_SERIES_MESSAGE =
  "Cited pages list more than one assay with unlabeled RESULT columns. Ask which series to extract; do not guess.";

type AssayDef = {
  id: string;
  label: string;
  pattern: RegExp;
};

const ASSAYS: readonly AssayDef[] = [
  {
    id: "conductivity",
    label: "Conductivity",
    pattern: /\bconductiv(?:ity|e)\b/i,
  },
  {
    id: "toc",
    label: "TOC",
    pattern: /\bTOC\b|\btotal organic carbon\b/i,
  },
];

export function assayLabelsInText(text: string): string[] {
  const found: string[] = [];
  for (const assay of ASSAYS) {
    assay.pattern.lastIndex = 0;
    if (assay.pattern.test(text)) found.push(assay.label);
  }
  return found;
}

/** True when the request names two assays, or one assay plus an OR/slash alternative. */
export function isAmbiguousMetricRequest(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return false;
  const assays = assayLabelsInText(trimmed);
  if (assays.length >= 2) return true;
  if (assays.length === 0) return false;
  return /\b(?:or|and)\b|\//i.test(trimmed) && /\blevels?\b|\bresults?\b/i.test(trimmed);
}

export function hasUnlabeledResultColumns(text: string): boolean {
  const matches = text.match(/\bRESULT\b/gi);
  return (matches?.length ?? 0) >= 2;
}

export function isUnboundDualSeriesPage(text: string): boolean {
  return assayLabelsInText(text).length >= 2 && hasUnlabeledResultColumns(text);
}

export type MetricSeriesGate =
  | { ok: true }
  | { ok: false; reason: "ambiguous_request" | "unbound_page"; message: string };

export function gateMetricSeriesExtract(input: {
  request: string;
  pageText?: string;
}): MetricSeriesGate {
  if (isAmbiguousMetricRequest(input.request)) {
    return {
      ok: false,
      reason: "ambiguous_request",
      message: AMBIGUOUS_METRIC_REQUEST_MESSAGE,
    };
  }
  const pageText = input.pageText?.trim() ?? "";
  if (pageText && isUnboundDualSeriesPage(pageText)) {
    const labels = assayLabelsInText(pageText);
    return {
      ok: false,
      reason: "unbound_page",
      message: `${UNBOUND_DUAL_SERIES_MESSAGE} Assays on the page: ${labels.join(", ")}.`,
    };
  }
  return { ok: true };
}

export type DatedSeriesRow = {
  date: string;
  /** Null / blank / NA means this metric has no value on that date. */
  value: string | null;
};

/**
 * Dates that belong to the selected metric's accepted numeric rows.
 * A neighboring column's NA must not drop a date that still has a value.
 */
export function datesAlignedToNumericRows(
  rows: readonly DatedSeriesRow[]
): string[] {
  const dates: string[] = [];
  for (const row of rows) {
    const value = row.value?.trim() ?? "";
    if (!value || /^n\/?a$/i.test(value)) continue;
    const date = row.date.trim();
    if (date) dates.push(date);
  }
  return dates;
}

export function alignExtractedDates(
  values: readonly number[],
  dates: readonly (string | null)[] | undefined
): Array<string | null> | null {
  if (!dates || dates.length !== values.length) return null;
  return [...dates];
}
