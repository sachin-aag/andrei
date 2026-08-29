import { chartBrandColors, seriesFill } from "@/lib/charts/brand-colors";
import type { ChartBrandColors } from "@/lib/charts/brand-colors";
import { resolveCustomerId } from "@/lib/customers/resolve";
import { formatStat } from "./format";
import type { AnovaAnalysisSummary } from "./types";

const WIDTH = 960;
const HEIGHT = 420;

type Canvas2d = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  arc: (x: number, y: number, r: number, start: number, end: number) => void;
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

function defaultLoadCanvas(): CanvasModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@napi-rs/canvas") as CanvasModule;
  } catch {
    return null;
  }
}

export type RenderAnovaPlotError = { error: "canvas_unavailable" | "no_groups" };

export function renderAnovaIntervalPlotPng(
  analysis: AnovaAnalysisSummary,
  options: { loadCanvas?: () => CanvasModule | null; packId?: ReturnType<typeof resolveCustomerId> } = {}
): Buffer | RenderAnovaPlotError {
  const groups = analysis.results.groups;
  if (groups.length === 0) return { error: "no_groups" };

  const load = options.loadCanvas ?? defaultLoadCanvas;
  const canvasMod = load();
  if (!canvasMod) return { error: "canvas_unavailable" };

  const colors = chartBrandColors(options.packId ?? resolveCustomerId());
  const canvas = canvasMod.createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "canvas_unavailable" };

  drawAnovaIntervalPlot(ctx, analysis, colors);
  return canvas.toBuffer("image/png");
}

function drawAnovaIntervalPlot(
  ctx: Canvas2d,
  analysis: AnovaAnalysisSummary,
  colors: ChartBrandColors
): void {
  const groups = analysis.results.groups;
  const plotLeft = 72;
  const plotRight = WIDTH - 28;
  const plotTop = 56;
  const plotBottom = HEIGHT - 72;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const ys = groups.flatMap((group) => [group.ciLow, group.ciHigh, group.mean]);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.12;
  yMin -= pad;
  yMax += pad;
  const ySpan = yMax - yMin || 1;
  const xToPx = (index: number) =>
    plotLeft + ((index + 0.5) / groups.length) * plotWidth;
  const yToPx = (y: number) => plotBottom - ((y - yMin) / ySpan) * plotHeight;
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  ctx.fillStyle = colors.plotFill;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = colors.brand800;
  ctx.font = "16px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(
    `Interval plot of ${analysis.config.responseColumnName} vs ${analysis.config.factorColumnName}`,
    (plotLeft + plotRight) / 2,
    18
  );

  ctx.fillStyle = colors.axis;
  ctx.font = "12px Helvetica, Arial, sans-serif";
  ctx.save();
  ctx.translate(22, (plotTop + plotBottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(analysis.config.responseColumnName, 0, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(
    analysis.config.factorColumnName,
    (plotLeft + plotRight) / 2,
    plotBottom + 36
  );

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (const tick of yTicks) {
    const y = yToPx(tick);
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.fillStyle = colors.axis;
    ctx.font = "11px Helvetica, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(formatStat(tick, 2), plotLeft - 8, y);
  }

  ctx.strokeStyle = colors.grid;
  ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);

  groups.forEach((group, index) => {
    const x = xToPx(index);
    const fill = seriesFill(colors, index);
    ctx.strokeStyle = fill;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, yToPx(group.ciLow));
    ctx.lineTo(x, yToPx(group.ciHigh));
    ctx.stroke();
    for (const yVal of [group.ciLow, group.ciHigh]) {
      ctx.beginPath();
      ctx.moveTo(x - 8, yToPx(yVal));
      ctx.lineTo(x + 8, yToPx(yVal));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, yToPx(group.mean), 5, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = colors.axis;
    ctx.font = "11px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(group.label, x, plotBottom + 8);
  });
}
