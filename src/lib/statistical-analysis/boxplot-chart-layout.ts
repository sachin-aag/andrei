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
