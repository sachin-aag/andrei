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

function kindLabel(kind: SpecLimitKind): string {
  switch (kind) {
    case "lsl":
      return "LSL";
    case "usl":
      return "USL";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function specLimitLabelText(kind: SpecLimitKind, value: number): string {
  return `${kindLabel(kind)} ${formatLimit(value)}`;
}

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
  const text = specLimitLabelText(input.kind, input.value);
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
