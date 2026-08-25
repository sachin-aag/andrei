import { z } from "zod";

export type ChartPoint = {
  /** X position. Assigned by layout, not by the model. */
  x: number;
  y: number;
  /** Legend group, e.g. a handpiece serial. null = single ungrouped series. */
  series: string | null;
  /** Source label for the tooltip/audit, e.g. "P33-0924-10012 Tip 3". */
  label: string;
};

export type ChartLimits = {
  lower: number | null;
  upper: number | null;
};

export type ChartCitation = {
  attachmentId: string;
  page: number;
};

export type ChartLayout = {
  /** "combined" = one chart. "per-series" = one chart per series group. */
  mode: "combined" | "per-series";
  /** "unit" = colour + legend by series. "none" = one colour, no legend. */
  seriesBy: "unit" | "none";
  /**
   * "sequential" = x is 1..N across all points, "replicate" = x is the
   * within-series index, series overlaid.
   */
  xAxis: "sequential" | "replicate";
  /** null = auto from data and limits with padding. */
  yRange: { min: number; max: number } | null;
};

export type ChartSpec = {
  version: 1;
  kind: "scatter";
  /** Extraction / restyle identity (requirement ID or measurement name). */
  query: string;
  title: string;
  xLabel: string;
  yLabel: string;
  /** Unit of measure, e.g. "ozf-in". */
  uom: string;
  limits: ChartLimits;
  points: ChartPoint[];
  layout: ChartLayout;
  /** Provenance. Empty only for explicitly-mocked specs. */
  citations: ChartCitation[];
  /** Advisory only — never fails the tool. */
  sampleSizeMin: number | null;
};

export const DEFAULT_CHART_LAYOUT: ChartLayout = {
  mode: "combined",
  seriesBy: "unit",
  xAxis: "sequential",
  yRange: null,
};

const chartPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  series: z.string().nullable(),
  label: z.string(),
});

const chartLimitsSchema = z.object({
  lower: z.number().finite().nullable(),
  upper: z.number().finite().nullable(),
});

const chartCitationSchema = z.object({
  attachmentId: z.string().min(1),
  page: z.number().int().positive(),
});

const chartLayoutSchema = z.object({
  mode: z.enum(["combined", "per-series"]),
  seriesBy: z.enum(["unit", "none"]),
  xAxis: z.enum(["sequential", "replicate"]),
  yRange: z
    .object({
      min: z.number().finite(),
      max: z.number().finite(),
    })
    .nullable(),
});

export const chartSpecSchema = z.object({
  version: z.literal(1),
  kind: z.literal("scatter"),
  query: z.string().trim().min(1).max(200),
  title: z.string().max(120),
  xLabel: z.string().max(60),
  yLabel: z.string().max(80),
  uom: z.string().max(40),
  limits: chartLimitsSchema,
  points: z.array(chartPointSchema).min(1),
  layout: chartLayoutSchema,
  citations: z.array(chartCitationSchema),
  sampleSizeMin: z.number().int().positive().nullable(),
});

/** Single parser for TipTap attrs, comment JSON, and restyle. Invalid → null. */
export function parseChartSpec(raw: unknown): ChartSpec | null {
  const parsed = chartSpecSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function seriesKey(series: string | null): string {
  return series ?? "";
}

function comparePoints(a: ChartPoint, b: ChartPoint, aIndex: number, bIndex: number): number {
  const seriesCmp = seriesKey(a.series).localeCompare(seriesKey(b.series), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (seriesCmp !== 0) return seriesCmp;
  const labelCmp = a.label.localeCompare(b.label, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (labelCmp !== 0) return labelCmp;
  return aIndex - bIndex;
}

function sortedPoints(points: ChartPoint[]): ChartPoint[] {
  return points
    .map((point, index) => ({ point, index }))
    .toSorted((a, b) => comparePoints(a.point, b.point, a.index, b.index))
    .map(({ point }) => point);
}

/** Assign x positions per layout.xAxis and sort deterministically. */
export function layoutPoints(spec: ChartSpec): ChartPoint[] {
  const ordered = sortedPoints(spec.points);
  if (spec.layout.xAxis === "sequential") {
    return ordered.map((point, index) => ({ ...point, x: index + 1 }));
  }
  const counts = new Map<string, number>();
  return ordered.map((point) => {
    const key = seriesKey(point.series);
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return { ...point, x: next };
  });
}

function niceNumber(range: number, round: boolean): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let nice: number;
  if (round) {
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
  } else if (fraction <= 1) {
    nice = 1;
  } else if (fraction <= 2) {
    nice = 2;
  } else if (fraction <= 5) {
    nice = 5;
  } else {
    nice = 10;
  }
  return nice * 10 ** exponent;
}

function yValues(spec: ChartSpec): number[] {
  const values = spec.points.map((point) => point.y);
  if (spec.limits.lower != null) values.push(spec.limits.lower);
  if (spec.limits.upper != null) values.push(spec.limits.upper);
  return values;
}

/** Auto y-range: covers data and both limits, padded, snapped to a nice step. */
export function resolveYRange(spec: ChartSpec): { min: number; max: number } {
  if (spec.layout.yRange) {
    const { min, max } = spec.layout.yRange;
    if (max > min) return { min, max };
  }
  const values = yValues(spec);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const span = dataMax - dataMin;
  const pad = span === 0 ? Math.max(1, Math.abs(dataMax) * 0.1 || 1) : span * 0.08;
  let min = dataMin - pad;
  let max = dataMax + pad;
  const allNonNegative = values.every((value) => value >= 0);
  if (allNonNegative) min = 0;
  const niceSpan = niceNumber(max - min, false);
  const step = niceNumber(niceSpan / 6, true);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  if (allNonNegative) min = 0;
  if (max <= min) max = min + step;
  return { min, max };
}

export function yTickValues(spec: ChartSpec): number[] {
  const { min, max } = resolveYRange(spec);
  const span = max - min;
  const step = niceNumber(span / 6, true);
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let value = start; value <= max + step / 2; value += step) {
    const rounded = Number(value.toPrecision(12));
    if (rounded >= min - step / 100 && rounded <= max + step / 100) {
      ticks.push(rounded);
    }
    if (ticks.length > 24) break;
  }
  if (!ticks.includes(min)) ticks.unshift(min);
  if (!ticks.includes(max)) ticks.push(max);
  return [...new Set(ticks.map((tick) => Number(tick.toPrecision(12))))].toSorted(
    (a, b) => a - b
  );
}

/** Split into one spec per series when layout.mode === "per-series". */
export function splitSpec(spec: ChartSpec): ChartSpec[] {
  if (spec.layout.mode !== "per-series") return [spec];
  const groups = new Map<string, ChartPoint[]>();
  for (const point of spec.points) {
    const key = seriesKey(point.series) || "series";
    const list = groups.get(key) ?? [];
    list.push(point);
    groups.set(key, list);
  }
  const keys = [...groups.keys()].toSorted((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  return keys.map((key) => {
    const points = groups.get(key) ?? [];
    const titleSuffix = key === "series" ? "" : ` — ${key}`;
    const next: ChartSpec = {
      ...spec,
      title: `${spec.title}${titleSuffix}`,
      points,
      layout: { ...spec.layout, mode: "combined", seriesBy: "none" },
    };
    return { ...next, points: layoutPoints(next) };
  });
}

export function mergeChartLayout(
  base: ChartLayout,
  patch: {
    mode?: ChartLayout["mode"];
    seriesBy?: ChartLayout["seriesBy"];
    xAxis?: ChartLayout["xAxis"];
    yMax?: number;
  }
): ChartLayout {
  const yRange =
    typeof patch.yMax === "number" && Number.isFinite(patch.yMax)
      ? {
          min: base.yRange?.min ?? 0,
          max: patch.yMax,
        }
      : base.yRange;
  return {
    mode: patch.mode ?? base.mode,
    seriesBy: patch.seriesBy ?? base.seriesBy,
    xAxis: patch.xAxis ?? base.xAxis,
    yRange,
  };
}

export function formatChartProvenance(spec: ChartSpec): string {
  const n = spec.points.length;
  const { lower, upper } = spec.limits;
  const limitBit =
    lower != null && upper != null
      ? `limits ${lower}–${upper}${spec.uom ? ` ${spec.uom}` : ""}`
      : lower != null
        ? `limit ≥ ${lower}${spec.uom ? ` ${spec.uom}` : ""}`
        : upper != null
          ? `limit ≤ ${upper}${spec.uom ? ` ${spec.uom}` : ""}`
          : "no limits";
  const pages = [
    ...new Set(spec.citations.map((citation) => citation.page).toSorted((a, b) => a - b)),
  ];
  const pageBit =
    pages.length === 0
      ? "no citations"
      : pages.length === 1
        ? `p. ${pages[0]}`
        : `p. ${pages[0]}–${pages[pages.length - 1]}`;
  return `${n} point${n === 1 ? "" : "s"}, ${limitBit}, ${spec.query}, ${pageBit}`;
}

