import type { ChartPoint } from "@/lib/charts/chart-spec";

/** Individual dots when a mean line is on and there is no legend. */
export const MEAN_LINE_INDIVIDUAL_FILL = "#94a3b8";
export const MEAN_LINE_MARKER_RADIUS = 6;
/** Horizontal spread in px for overlapping scatter points at the same X. */
export const SCATTER_MEAN_LINE_JITTER_PX = 8;

export function chartShowsMeanLine(layout: {
  showMeanLine?: boolean;
}): boolean {
  return layout.showMeanLine === true;
}

export type MeanLinePoint = {
  x: number;
  y: number;
  series: string | null;
  n: number;
};

export type MeanLineGroup = {
  series: string | null;
  points: MeanLinePoint[];
};

/**
 * Mean Y at each X. With a legend (`seriesBy: "unit"`), one polyline per
 * series; otherwise one line across all points.
 */
export function meanLineGroups(
  points: Array<Pick<ChartPoint, "x" | "y" | "series">>,
  seriesBy: "unit" | "none" = "none"
): MeanLineGroup[] {
  const splitSeries = seriesBy === "unit";
  const buckets = new Map<
    string,
    { series: string | null; x: number; sum: number; n: number }
  >();
  const order: string[] = [];
  for (const point of points) {
    const series = splitSeries ? point.series : null;
    const key = `${series ?? ""}\0${point.x}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += point.y;
      existing.n += 1;
      continue;
    }
    buckets.set(key, { series, x: point.x, sum: point.y, n: 1 });
    order.push(key);
  }

  const bySeries = new Map<string, MeanLinePoint[]>();
  const seriesOrder: string[] = [];
  for (const key of order) {
    const bucket = buckets.get(key)!;
    const seriesKey = bucket.series ?? "";
    let list = bySeries.get(seriesKey);
    if (!list) {
      list = [];
      bySeries.set(seriesKey, list);
      seriesOrder.push(seriesKey);
    }
    list.push({
      x: bucket.x,
      y: bucket.sum / bucket.n,
      series: bucket.series,
      n: bucket.n,
    });
  }

  return seriesOrder.map((key) => ({
    series: key === "" ? null : key,
    points: (bySeries.get(key) ?? []).toSorted((a, b) => a.x - b.x || a.y - b.y),
  }));
}

/** Pixel X offsets so overlapping scatter points at the same X fan out. */
export function scatterJitterPxByIndex(
  points: Array<{ x: number }>,
  maxPx: number
): number[] {
  const groups = new Map<number, number[]>();
  points.forEach((point, index) => {
    const list = groups.get(point.x);
    if (list) list.push(index);
    else groups.set(point.x, [index]);
  });
  const offsets = points.map(() => 0);
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const last = indices.length - 1;
    for (let i = 0; i < indices.length; i++) {
      offsets[indices[i]!] = (i / last - 0.5) * 2 * maxPx;
    }
  }
  return offsets;
}

export function finiteMean(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
