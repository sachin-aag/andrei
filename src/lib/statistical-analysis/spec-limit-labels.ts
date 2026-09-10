import { formatLimit } from "@/lib/statistical-analysis/format";

export type PlotBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type SpecLimitKind = "lsl" | "usl";

export type SpecLimitInput = {
  kind: SpecLimitKind;
  value: number;
  lineX: number;
};

export type SpecLimitLabelLayout = {
  kind: SpecLimitKind;
  text: string;
  lineX: number;
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
};

/** Approximate width of 8px tabular-nums at the chart scale. */
const CHAR_WIDTH = 4.4;
const LABEL_HEIGHT = 10;
const EDGE_PAD = 3;
const LINE_GAP = 3;
const MIN_LABEL_GAP = 6;
/** Sit in the SVG gutter above the plot frame so labels miss axis ticks. */
const TOP_GUTTER_OFFSET = 3;
/** Inside-plot fallback, above the x-axis numbers. */
const BOTTOM_INNER_OFFSET = 8;

export function estimateLabelWidth(text: string): number {
  return text.length * CHAR_WIDTH;
}

function horizontalRange(
  x: number,
  textAnchor: SpecLimitLabelLayout["textAnchor"],
  width: number
): { left: number; right: number } {
  switch (textAnchor) {
    case "start":
      return { left: x, right: x + width };
    case "end":
      return { left: x - width, right: x };
    case "middle":
      return { left: x - width / 2, right: x + width / 2 };
    default: {
      const exhaustive: never = textAnchor;
      return exhaustive;
    }
  }
}

function overlaps(a: SpecLimitLabelLayout, b: SpecLimitLabelLayout): boolean {
  if (Math.abs(a.y - b.y) >= LABEL_HEIGHT) return false;
  const ar = horizontalRange(a.x, a.textAnchor, estimateLabelWidth(a.text));
  const br = horizontalRange(b.x, b.textAnchor, estimateLabelWidth(b.text));
  return (
    ar.left < br.right + MIN_LABEL_GAP && br.left < ar.right + MIN_LABEL_GAP
  );
}

function placeOnSide(
  input: SpecLimitInput,
  plot: PlotBox,
  side: "top" | "bottom"
): SpecLimitLabelLayout {
  const text = formatLimit(input.value);
  const width = estimateLabelWidth(text);
  const y =
    side === "top"
      ? plot.top - TOP_GUTTER_OFFSET
      : plot.bottom - BOTTOM_INNER_OFFSET;
  const minX = plot.left + EDGE_PAD;
  const maxX = plot.right - EDGE_PAD;

  // Prefer the inner face of the spec line so LSL/USL read toward the data
  // and stay off the y-axis tick numbers.
  let textAnchor: SpecLimitLabelLayout["textAnchor"] =
    input.kind === "lsl" ? "start" : "end";
  let x =
    input.kind === "lsl" ? input.lineX + LINE_GAP : input.lineX - LINE_GAP;

  const overflowsRight =
    textAnchor === "start" ? x + width > maxX : x > maxX;
  const overflowsLeft =
    textAnchor === "end" ? x - width < minX : x < minX;

  if (overflowsRight && textAnchor === "start") {
    textAnchor = "end";
    x = input.lineX - LINE_GAP;
  } else if (overflowsLeft && textAnchor === "end") {
    textAnchor = "start";
    x = input.lineX + LINE_GAP;
  }

  if (textAnchor === "start") {
    x = Math.min(Math.max(x, minX), Math.max(minX, maxX - width));
  } else {
    x = Math.max(Math.min(x, maxX), Math.min(maxX, minX + width));
  }

  return {
    kind: input.kind,
    text,
    lineX: input.lineX,
    x,
    y,
    textAnchor,
  };
}

export function layoutSpecLimitLabels(
  limits: SpecLimitInput[],
  plot: PlotBox
): SpecLimitLabelLayout[] {
  const finite = limits.filter(
    (limit) => Number.isFinite(limit.value) && Number.isFinite(limit.lineX)
  );
  const placed = finite.map((limit) => placeOnSide(limit, plot, "top"));
  if (placed.length < 2) return placed;

  const colliding = placed.some((label, i) =>
    placed.some((other, j) => i < j && overlaps(label, other))
  );
  if (!colliding) return placed;

  return finite.map((limit) =>
    placeOnSide(limit, plot, limit.kind === "usl" ? "bottom" : "top")
  );
}

export type ControlLimitKind = "ucl" | "lcl";
export type HorizontalSpecKind = "lsl" | "usl";
export type HorizontalLimitKind = ControlLimitKind | HorizontalSpecKind;
export type HorizontalLimitEdge = "left" | "right";

export type ControlLimitInput = {
  kind: ControlLimitKind;
  value: number;
  lineY: number;
};

export type HorizontalLimitInput = {
  kind: HorizontalLimitKind;
  value: number;
  lineY: number;
  edge?: HorizontalLimitEdge;
};

export type ControlLimitLabelLayout = {
  kind: HorizontalLimitKind;
  text: string;
  lineY: number;
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
  edge: HorizontalLimitEdge;
};

const ABOVE_LINE = 4;
const BELOW_LINE = 10;

function verticalOverlap(
  a: ControlLimitLabelLayout,
  b: ControlLimitLabelLayout
): boolean {
  return Math.abs(a.y - b.y) < LABEL_HEIGHT;
}

function isUpperHorizontalLimit(kind: HorizontalLimitKind): boolean {
  return kind === "ucl" || kind === "usl";
}

function placeAlongLine(
  input: HorizontalLimitInput,
  plot: PlotBox,
  side: "above" | "below"
): ControlLimitLabelLayout {
  const text = formatLimit(input.value);
  const minY = plot.top - TOP_GUTTER_OFFSET;
  const maxY = plot.bottom - BOTTOM_INNER_OFFSET;
  const yUnclamped =
    side === "above" ? input.lineY - ABOVE_LINE : input.lineY + BELOW_LINE;
  const edge = input.edge ?? "right";
  return {
    kind: input.kind,
    text,
    lineY: input.lineY,
    x: edge === "left" ? plot.left + EDGE_PAD : plot.right - EDGE_PAD,
    y: Math.min(maxY, Math.max(minY, yUnclamped)),
    textAnchor: edge === "left" ? "start" : "end",
    edge,
  };
}

function layoutOneEdge(
  finite: HorizontalLimitInput[],
  plot: PlotBox
): ControlLimitLabelLayout[] {
  const placed = finite.map((limit) =>
    placeAlongLine(
      limit,
      plot,
      isUpperHorizontalLimit(limit.kind) ? "above" : "below"
    )
  );
  if (placed.length < 2) return placed;

  const colliding = placed.some((label, i) =>
    placed.some((other, j) => i < j && verticalOverlap(label, other))
  );
  if (!colliding) return placed;

  const upper = finite.find((limit) => isUpperHorizontalLimit(limit.kind));
  const lower = finite.find((limit) => !isUpperHorizontalLimit(limit.kind));
  if (!upper || !lower) return placed;

  const top = placeAlongLine(upper, plot, "above");
  let bottom = placeAlongLine(lower, plot, "below");
  if (verticalOverlap(top, bottom)) {
    bottom = {
      ...bottom,
      y: Math.min(
        plot.bottom - BOTTOM_INNER_OFFSET,
        top.y + LABEL_HEIGHT + MIN_LABEL_GAP
      ),
    };
  }
  return [top, bottom];
}

export function layoutHorizontalLimitLabels(
  limits: HorizontalLimitInput[],
  plot: PlotBox
): ControlLimitLabelLayout[] {
  const finite = limits.filter(
    (limit) => Number.isFinite(limit.value) && Number.isFinite(limit.lineY)
  );
  const left = finite.filter((limit) => (limit.edge ?? "right") === "left");
  const right = finite.filter((limit) => (limit.edge ?? "right") === "right");
  return [...layoutOneEdge(left, plot), ...layoutOneEdge(right, plot)];
}

export function layoutControlLimitLabels(
  limits: ControlLimitInput[],
  plot: PlotBox
): ControlLimitLabelLayout[] {
  return layoutHorizontalLimitLabels(limits, plot);
}

export function layoutHorizontalSpecLabels(
  limits: Array<{
    kind: HorizontalSpecKind;
    value: number;
    lineY: number;
    edge?: HorizontalLimitEdge;
  }>,
  plot: PlotBox
): ControlLimitLabelLayout[] {
  return layoutHorizontalLimitLabels(limits, plot);
}
