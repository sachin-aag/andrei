import { niceStep } from "@/lib/charts/axis-domain";
import type { BoxplotGroupStats } from "./types";

export const BOXPLOT_CHART_WIDTH = 960;
export const BOXPLOT_CHART_HEIGHT = 520;
export const BOXPLOT_OUTER_BAND = 26;

const INNER_FONT_SIZE = 11;
const BOTTOM_PADDING = 16;
const PLOT_LEFT = 72;
const PLOT_TOP = 52;
const RIGHT_MARGIN = 28;

/** Approximate sans-serif glyph width at 11px for layout (not measurement). */
function estimateTextWidth(label: string, fontSize: number): number {
  return label.length * fontSize * 0.58;
}

export function longestInnerLabel(groups: Pick<BoxplotGroupStats, "labels">[]): string {
  return groups.reduce((longest, group) => {
    const label = group.labels[0] ?? "";
    return label.length > longest.length ? label : longest;
  }, "");
}

export function shouldRotateInnerLabels(
  categoryCount: number,
  groupCount: number,
  longestInnerChars: number
): boolean {
  return categoryCount > 0 && (groupCount > 6 || longestInnerChars > 8);
}

export type BoxplotAxisLayout = {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  plotWidth: number;
  plotHeight: number;
  rotateInner: boolean;
  innerBand: number;
  outerBand: number;
  categoryLabelY: (level: number) => number;
};

export function boxplotAxisLayout(
  groups: Pick<BoxplotGroupStats, "labels">[],
  categoryCount: number
): BoxplotAxisLayout {
  const longestLabel = longestInnerLabel(groups);
  const rotateInner = shouldRotateInnerLabels(
    categoryCount,
    groups.length,
    longestLabel.length
  );

  const innerLabelOffset = rotateInner ? 14 : 16;
  let innerBand: number;
  if (categoryCount === 0) {
    innerBand = 8;
  } else if (rotateInner) {
    const textWidth = estimateTextWidth(longestLabel, INNER_FONT_SIZE);
    const rotatedDepth = textWidth * Math.SQRT1_2;
    innerBand = Math.ceil(innerLabelOffset + rotatedDepth + 10);
    innerBand = Math.max(innerBand, 48);
  } else {
    innerBand = 22;
  }

  const axisHeight =
    categoryCount === 0
      ? innerBand
      : innerBand + Math.max(0, categoryCount - 1) * BOXPLOT_OUTER_BAND;

  const plotBottom = BOXPLOT_CHART_HEIGHT - BOTTOM_PADDING - axisHeight;
  const plotRight = BOXPLOT_CHART_WIDTH - RIGHT_MARGIN;

  const categoryLabelY = (level: number): number => {
    if (level === 0) return plotBottom + innerLabelOffset;
    return plotBottom + innerBand + (level - 1) * BOXPLOT_OUTER_BAND + 16;
  };

  return {
    width: BOXPLOT_CHART_WIDTH,
    height: BOXPLOT_CHART_HEIGHT,
    plotLeft: PLOT_LEFT,
    plotRight,
    plotTop: PLOT_TOP,
    plotBottom,
    plotWidth: plotRight - PLOT_LEFT,
    plotHeight: plotBottom - PLOT_TOP,
    rotateInner,
    innerBand,
    outerBand: BOXPLOT_OUTER_BAND,
    categoryLabelY,
  };
}

/** Lowest y coordinate a rotated inner label may reach (for tests). */
export function rotatedInnerLabelBottomY(
  layout: BoxplotAxisLayout,
  longestLabel: string
): number {
  const textWidth = estimateTextWidth(longestLabel, INNER_FONT_SIZE);
  const rotatedDepth = textWidth * Math.SQRT1_2;
  return layout.categoryLabelY(0) + rotatedDepth;
}

/** Y coordinate for an optional X-axis title below category tiers. */
export function boxplotXAxisTitleY(
  layout: BoxplotAxisLayout,
  categoryCount: number
): number {
  return layout.height - BOTTOM_PADDING + (categoryCount > 0 ? 14 : 8);
}

/** Y window: whiskers plus outliers, padded 8%. Shared with the Excel export. */
export function boxplotYExtent(
  groups: Pick<BoxplotGroupStats, "whiskerLow" | "whiskerHigh" | "outliers">[]
): { min: number; max: number } {
  const ys = groups.flatMap((group) => [
    group.whiskerLow,
    group.whiskerHigh,
    ...group.outliers,
  ]);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    min = (Number.isFinite(min) ? min : 0) - 1;
    max = (Number.isFinite(max) ? max : 0) + 1;
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

/** Roughly four intervals across the window, on a nice 1-2-5 step. */
export function boxplotTickStep(min: number, max: number): number {
  return niceStep((max - min || 1) / 4);
}

export function boxplotYTicks(min: number, max: number): number[] {
  const step = boxplotTickStep(min, max);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.01; value += step) {
    ticks.push(Number(value.toPrecision(8)));
  }
  return ticks.length > 0 ? ticks : [min, max];
}
