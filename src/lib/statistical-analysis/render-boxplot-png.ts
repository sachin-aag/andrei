import { chartBrandColors, type ChartBrandColors } from "@/lib/charts/brand-colors";
import { chartFontFamily, loadChartCanvas } from "@/lib/charts/load-canvas";
import {
  chartShowsMeanLine,
  finiteMean,
  MEAN_LINE_MARKER_RADIUS,
} from "@/lib/charts/mean-line";
import { resolveCustomerId } from "@/lib/customers/resolve";
import {
  boxplotXAxisLabel,
  boxplotYAxisLabel,
  nestedCategorySpans,
} from "./boxplot";
import { boxplotAxisLayout, boxplotXAxisTitleY } from "./boxplot-chart-layout";
import { formatStat } from "./format";
import type { BoxplotAnalysisSummary, BoxplotGroupStats } from "./types";

type Canvas2d = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  globalAlpha: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  stroke: () => void;
  fill: () => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  strokeRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
  arc: (x: number, y: number, r: number, start: number, end: number) => void;
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
  return loadChartCanvas() as CanvasModule | null;
}

export type RenderBoxplotError = { error: "canvas_unavailable" | "no_groups" };

export function renderBoxplotPng(
  analysis: BoxplotAnalysisSummary,
  options: {
    loadCanvas?: () => CanvasModule | null;
    packId?: ReturnType<typeof resolveCustomerId>;
  } = {}
): Buffer | RenderBoxplotError {
  if (analysis.results.groups.length === 0) return { error: "no_groups" };
  const load = options.loadCanvas ?? defaultLoadCanvas;
  const canvasMod = load();
  if (!canvasMod) return { error: "canvas_unavailable" };
  const colors = chartBrandColors(options.packId ?? resolveCustomerId());
  const layout = boxplotAxisLayout(analysis.results.groups, analysis.config.categoryColumnNames.length);
  const canvas = canvasMod.createCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "canvas_unavailable" };
  drawBoxplot(ctx, analysis, colors, layout);
  return canvas.toBuffer("image/png");
}

function yExtent(groups: BoxplotGroupStats[]): { min: number; max: number } {
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

function drawBoxplot(
  ctx: Canvas2d,
  analysis: BoxplotAnalysisSummary,
  colors: ChartBrandColors,
  layout: ReturnType<typeof boxplotAxisLayout>
): void {
  const groups = analysis.results.groups;
  const categoryCount = analysis.config.categoryColumnNames.length;
  const {
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    plotWidth,
    plotHeight,
    rotateInner,
    categoryLabelY,
  } = layout;
  const { min: yMin, max: yMax } = yExtent(groups);
  const ySpan = yMax - yMin || 1;
  const xToPx = (index: number) =>
    plotLeft + ((index + 0.5) / groups.length) * plotWidth;
  const yToPx = (y: number) => plotBottom - ((y - yMin) / ySpan) * plotHeight;
  const boxWidth = Math.min(42, (plotWidth / groups.length) * 0.55);
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const yLabel = boxplotYAxisLabel(analysis.config);
  const xLabel = boxplotXAxisLabel(analysis.config);
  const xTitleY = xLabel ? boxplotXAxisTitleY(layout, categoryCount) : 0;

  ctx.fillStyle = "#f4f6f9";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colors.plotFill;
  ctx.fillRect(plotLeft, plotTop, plotWidth, plotHeight);
  ctx.strokeStyle = colors.grid;
  ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);

  ctx.fillStyle = colors.brand800;
  ctx.font = `16px ${chartFontFamily()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(analysis.title, (plotLeft + plotRight) / 2, 18);

  ctx.fillStyle = colors.axis;
  ctx.font = `12px ${chartFontFamily()}`;
  ctx.save();
  ctx.translate(22, (plotTop + plotBottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (const tick of ticks) {
    const y = yToPx(tick);
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.fillStyle = colors.axis;
    ctx.font = `11px ${chartFontFamily()}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(formatStat(tick, 2), plotLeft - 8, y);
  }

  groups.forEach((group, index) => {
    const x = xToPx(index);
    const q1 = yToPx(group.q1);
    const q3 = yToPx(group.q3);
    const median = yToPx(group.median);
    const low = yToPx(group.whiskerLow);
    const high = yToPx(group.whiskerHigh);
    const boxTop = Math.min(q1, q3);
    const boxHeight = Math.max(1, Math.abs(q3 - q1));
    ctx.strokeStyle = colors.brand800;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, high);
    ctx.lineTo(x, boxTop);
    ctx.moveTo(x, Math.max(q1, q3));
    ctx.lineTo(x, low);
    ctx.moveTo(x - 8, high);
    ctx.lineTo(x + 8, high);
    ctx.moveTo(x - 8, low);
    ctx.lineTo(x + 8, low);
    ctx.stroke();
    ctx.fillStyle = colors.brand400;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x - boxWidth / 2, boxTop, boxWidth, boxHeight);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.brand600;
    ctx.strokeRect(x - boxWidth / 2, boxTop, boxWidth, boxHeight);
    ctx.beginPath();
    ctx.moveTo(x - boxWidth / 2, median);
    ctx.lineTo(x + boxWidth / 2, median);
    ctx.stroke();
    ctx.fillStyle = colors.brand800;
    ctx.font = `13px ${chartFontFamily()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const value of group.outliers) {
      ctx.fillText("*", x, yToPx(value));
    }
  });

  if (chartShowsMeanLine(analysis.config)) {
    const meanPoints = groups.flatMap((group, index) => {
      const mean = finiteMean(group.mean);
      return mean == null ? [] : [{ x: xToPx(index), y: yToPx(mean) }];
    });
    const first = meanPoints[0];
    if (meanPoints.length >= 2 && first) {
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < meanPoints.length; i++) {
        const point = meanPoints[i]!;
        ctx.lineTo(point.x, point.y);
      }
      ctx.strokeStyle = colors.brand600;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (const point of meanPoints) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, MEAN_LINE_MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = colors.brand600;
      ctx.fill();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = colors.plotFill;
      ctx.stroke();
    }
  }

  if (categoryCount === 0) return;
  for (let level = 0; level < categoryCount; level++) {
    const spans = nestedCategorySpans(groups, level);
    const y = categoryLabelY(level);
    ctx.fillStyle = colors.axis;
    ctx.font = `${level === 0 ? 11 : 12}px ${chartFontFamily()}`;
    for (const span of spans) {
      const start = xToPx(span.startIndex) - plotWidth / groups.length / 2;
      const end =
        xToPx(span.startIndex + span.count - 1) + plotWidth / groups.length / 2;
      const mid = (start + end) / 2;
      if (level > 0) {
        ctx.strokeStyle = colors.axis;
        ctx.beginPath();
        ctx.moveTo(start + 4, y - 10);
        ctx.lineTo(end - 4, y - 10);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(mid, y);
      if (level === 0 && rotateInner) ctx.rotate(-Math.PI / 4);
      ctx.textAlign = level === 0 && rotateInner ? "right" : "center";
      ctx.textBaseline = "middle";
      ctx.fillText(span.label, 0, 0);
      ctx.restore();
    }
  }

  if (xLabel) {
    ctx.fillStyle = colors.axis;
    ctx.font = `12px ${chartFontFamily()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(xLabel, (plotLeft + plotRight) / 2, xTitleY);
  }
}
