import type { ChartPoint } from "@/lib/charts/chart-spec";

export const CHART_MARKS = [
  "scatter",
  "line",
  "line_markers",
  "area",
  "column",
] as const;

export type ChartMark = (typeof CHART_MARKS)[number];

export const DEFAULT_CHART_MARK: ChartMark = "scatter";

export const CHART_MARK_LABELS: Record<ChartMark, string> = {
  scatter: "Scatter",
  line: "Line",
  line_markers: "Line + markers",
  area: "Area",
  column: "Column",
};

export function parseChartMark(value: unknown): ChartMark {
  return typeof value === "string" &&
    (CHART_MARKS as readonly string[]).includes(value)
    ? (value as ChartMark)
    : DEFAULT_CHART_MARK;
}

export function seriesPolylines(
  points: ChartPoint[]
): Array<{ series: string; points: ChartPoint[] }> {
  const groups = new Map<string, ChartPoint[]>();
  const order: string[] = [];
  for (const point of points) {
    const key = point.series ?? "";
    const list = groups.get(key);
    if (!list) {
      groups.set(key, [point]);
      order.push(key);
    } else {
      list.push(point);
    }
  }
  return order.map((series) => ({
    series,
    points: (groups.get(series) ?? []).toSorted((a, b) => a.x - b.x || a.y - b.y),
  }));
}

export type ColumnSegment = {
  x: number;
  series: string;
  y0: number;
  y1: number;
};

/** Stack when a legend is coloring series; otherwise one bar per x. */
export function columnStacks(
  points: ChartPoint[],
  stacked: boolean
): ColumnSegment[] {
  const byX = new Map<number, ChartPoint[]>();
  for (const point of points) {
    const list = byX.get(point.x);
    if (list) list.push(point);
    else byX.set(point.x, [point]);
  }
  const xs = [...byX.keys()].toSorted((a, b) => a - b);
  const segments: ColumnSegment[] = [];
  for (const x of xs) {
    const rows = byX.get(x) ?? [];
    if (!stacked) {
      const y = rows.reduce((sum, row) => sum + row.y, 0);
      segments.push({
        x,
        series: rows[0]?.series ?? "",
        y0: Math.min(0, y),
        y1: Math.max(0, y),
      });
      continue;
    }
    const bySeries = new Map<string, number>();
    const seriesOrder: string[] = [];
    for (const row of rows) {
      const key = row.series ?? "";
      if (!bySeries.has(key)) seriesOrder.push(key);
      bySeries.set(key, (bySeries.get(key) ?? 0) + row.y);
    }
    let pos = 0;
    let neg = 0;
    for (const series of seriesOrder) {
      const y = bySeries.get(series) ?? 0;
      if (y >= 0) {
        segments.push({ x, series, y0: pos, y1: pos + y });
        pos += y;
      } else {
        segments.push({ x, series, y0: neg + y, y1: neg });
        neg += y;
      }
    }
  }
  return segments;
}

export function stackedYExtent(
  points: ChartPoint[]
): { min: number; max: number } | null {
  const segments = columnStacks(points, true);
  if (segments.length === 0) return null;
  let min = 0;
  let max = 0;
  for (const segment of segments) {
    min = Math.min(min, segment.y0, segment.y1);
    max = Math.max(max, segment.y0, segment.y1);
  }
  return { min, max };
}

export type MarkGeometry =
  | { type: "points"; points: ChartPoint[] }
  | {
      type: "polylines";
      lines: Array<{ series: string; points: ChartPoint[] }>;
      markers: boolean;
      fill: boolean;
    }
  | { type: "columns"; segments: ColumnSegment[] };

/** Pixel width for a column bar, from the tightest gap on the x scale. */
export function columnBarWidthPx(
  xs: number[],
  xToPx: (x: number) => number
): number {
  const unique = [...new Set(xs)].toSorted((a, b) => a - b);
  if (unique.length === 0) return 8;
  let minGap = 1;
  if (unique.length >= 2) {
    minGap = Infinity;
    for (let i = 1; i < unique.length; i++) {
      minGap = Math.min(minGap, unique[i]! - unique[i - 1]!);
    }
  }
  const origin = unique[0]!;
  const px = Math.abs(xToPx(origin + minGap) - xToPx(origin));
  return Math.max(6, Math.min(56, px * 0.72));
}

export function markGeometry(input: {
  points: ChartPoint[];
  mark?: ChartMark | null;
  seriesBy?: "unit" | "none";
}): MarkGeometry {
  const mark = parseChartMark(input.mark);
  switch (mark) {
    case "scatter":
      return { type: "points", points: input.points };
    case "line":
      return {
        type: "polylines",
        lines: seriesPolylines(input.points),
        markers: false,
        fill: false,
      };
    case "line_markers":
      return {
        type: "polylines",
        lines: seriesPolylines(input.points),
        markers: true,
        fill: false,
      };
    case "area":
      return {
        type: "polylines",
        lines: seriesPolylines(input.points),
        markers: false,
        fill: true,
      };
    case "column":
      return {
        type: "columns",
        segments: columnStacks(input.points, input.seriesBy === "unit"),
      };
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}
