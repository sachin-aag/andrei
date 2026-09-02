import { chartBrandColors, type ChartBrandColors } from "@/lib/charts/brand-colors";
import { chartFontFamily, loadChartCanvas } from "@/lib/charts/load-canvas";
import { resolveCustomerId } from "@/lib/customers/resolve";
import { layoutSpecLimitLabels } from "./spec-limit-labels";
import { histogramOverlays } from "./types";
import type {
  CurvePoint,
  HistogramAnalysisSummary,
  HistogramBin,
} from "./types";

type Canvas2d = {
  fillStyle: string;
  strokeStyle: string;
  globalAlpha: number;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  setLineDash: (segments: number[]) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  stroke: () => void;
  fill: () => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  strokeRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
  save: () => void;
  restore: () => void;
  translate: (x: number, y: number) => void;
  rotate: (angle: number) => void;
};

type CanvasModule = {
  createCanvas: (width: number, height: number) => {
    getContext: (type: "2d") => Canvas2d | null;
    toBuffer: (mime: string) => Buffer;
  };
};

const PAGE_FILL = "#f4f6f9";
export const HISTOGRAM_PNG_WIDTH = 720;
export const HISTOGRAM_PNG_HEIGHT = 400;
const PLOT = { left: 52, right: 688, top: 48, bottom: 348 };

function defaultLoadCanvas(): CanvasModule | null {
  return loadChartCanvas() as CanvasModule | null;
}

export type RenderHistogramPlotError = { error: "canvas_unavailable" };

function domain(values: number[], pad = 0.08): [number, number] {
  if (values.length === 0) return [-1, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  return [min - span * pad, max + span * pad];
}

function scale(min: number, max: number, start: number, end: number) {
  const span = max - min || 1;
  return (value: number) => start + ((value - min) / span) * (end - start);
}

function canvasTextAlign(
  anchor: "start" | "middle" | "end"
): CanvasTextAlign {
  if (anchor === "middle") return "center";
  return anchor;
}

function font(size: number, weight: "normal" | "bold" = "normal"): string {
  return `${weight === "bold" ? "bold " : ""}${size}px ${chartFontFamily()}`;
}

function drawHistogramPanel(
  ctx: Canvas2d,
  bins: HistogramBin[],
  overallCurve: CurvePoint[],
  withinCurve: CurvePoint[],
  lsl: number | null,
  usl: number | null,
  overlays: ReturnType<typeof histogramOverlays>,
  colors: ChartBrandColors
): void {
  const drawLsl = overlays.showLsl && lsl != null;
  const drawUsl = overlays.showUsl && usl != null;
  const curvePoints = overlays.showDistributionLines
    ? [...overallCurve, ...withinCurve]
    : [];
  const counts = bins.map((bin) => bin.count);
  const curveYs = curvePoints.map((point) => point.y);
  const xValues = [
    ...bins.flatMap((bin) => [bin.x0, bin.x1]),
    ...curvePoints.map((point) => point.x),
    ...(drawLsl ? [lsl] : []),
    ...(drawUsl ? [usl] : []),
  ].filter((value): value is number => value != null && Number.isFinite(value));
  const [xMin, xMax] = domain(xValues, 0.02);
  const yMax = Math.max(1, ...counts, ...curveYs) * 1.12;
  const x = scale(xMin, xMax, PLOT.left, PLOT.right);
  const y = scale(0, yMax, PLOT.bottom, PLOT.top);

  ctx.fillStyle = colors.plotFill;
  ctx.fillRect(PLOT.left, PLOT.top, PLOT.right - PLOT.left, PLOT.bottom - PLOT.top);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    PLOT.left + 0.5,
    PLOT.top + 0.5,
    PLOT.right - PLOT.left - 1,
    PLOT.bottom - PLOT.top - 1
  );

  ctx.fillStyle = colors.axis;
  ctx.font = font(9);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Measurement", (PLOT.left + PLOT.right) / 2, PLOT.bottom + 18);
  ctx.save();
  ctx.translate(14, (PLOT.top + PLOT.bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Frequency", 0, 0);
  ctx.restore();

  for (const bin of bins) {
    const w = Math.max(1, x(bin.x1) - x(bin.x0) - 1);
    ctx.fillStyle = colors.brand400;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x(bin.x0), y(bin.count), w, PLOT.bottom - y(bin.count));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.brand500;
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x(bin.x0), y(bin.count), w, PLOT.bottom - y(bin.count));
  }

  const drawCurve = (
    points: CurvePoint[],
    stroke: string,
    dash: number[] = []
  ) => {
    if (points.length < 2) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach((point, i) => {
      const px = x(point.x);
      const py = y(point.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (overlays.showDistributionLines) {
    drawCurve(withinCurve, colors.brand600);
    drawCurve(overallCurve, colors.axis, [4, 3]);
  }

  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = colors.limit;
  ctx.lineWidth = 1;
  for (const limit of [
    ...(drawLsl ? [lsl] : []),
    ...(drawUsl ? [usl] : []),
  ]) {
    if (limit == null) continue;
    ctx.beginPath();
    ctx.moveTo(x(limit), PLOT.top);
    ctx.lineTo(x(limit), PLOT.bottom);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const specLabels = layoutSpecLimitLabels(
    [
      ...(drawLsl ? [{ kind: "lsl" as const, value: lsl, lineX: x(lsl) }] : []),
      ...(drawUsl ? [{ kind: "usl" as const, value: usl, lineX: x(usl) }] : []),
    ],
    PLOT
  );
  ctx.font = font(9, "bold");
  ctx.fillStyle = colors.limit;
  ctx.textBaseline = "alphabetic";
  for (const label of specLabels) {
    ctx.textAlign = canvasTextAlign(label.textAnchor);
    ctx.fillText(label.text, label.x, label.y);
  }
}

export function renderHistogramPng(
  analysis: HistogramAnalysisSummary,
  options: {
    loadCanvas?: () => CanvasModule | null;
    packId?: ReturnType<typeof resolveCustomerId>;
  } = {}
): Buffer | RenderHistogramPlotError {
  const load = options.loadCanvas ?? defaultLoadCanvas;
  const canvasMod = load();
  if (!canvasMod) return { error: "canvas_unavailable" };
  const colors = chartBrandColors(options.packId ?? resolveCustomerId());
  const canvas = canvasMod.createCanvas(
    HISTOGRAM_PNG_WIDTH,
    HISTOGRAM_PNG_HEIGHT
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "canvas_unavailable" };

  ctx.fillStyle = PAGE_FILL;
  ctx.fillRect(0, 0, HISTOGRAM_PNG_WIDTH, HISTOGRAM_PNG_HEIGHT);
  ctx.fillStyle = colors.brand800;
  ctx.font = font(14, "bold");
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(analysis.title, 16, 12);

  const overlays = histogramOverlays(analysis.config);
  drawHistogramPanel(
    ctx,
    analysis.results.histogram.bins,
    analysis.results.histogram.overallCurve,
    analysis.results.histogram.withinCurve,
    analysis.config.lsl,
    analysis.config.usl,
    overlays,
    colors
  );
  return canvas.toBuffer("image/png");
}
