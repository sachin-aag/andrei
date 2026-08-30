import { chartBrandColors } from "@/lib/charts/brand-colors";
import type { ChartBrandColors } from "@/lib/charts/brand-colors";
import { chartFontFamily, loadChartCanvas } from "@/lib/charts/load-canvas";
import { resolveCustomerId } from "@/lib/customers/resolve";
import { formatLimit, formatPpm, formatPValue, formatStat } from "./format";
import {
  layoutControlLimitLabels,
  layoutHorizontalSpecLabels,
  layoutSpecLimitLabels,
} from "./spec-limit-labels";
import type {
  CapabilitySixpackResult,
  ControlChartSeries,
  CurvePoint,
  HistogramBin,
  ProbabilityPlotPoint,
  SixpackAnalysisSummary,
} from "./types";

const PAGE_FILL = "#f4f6f9";
const HEADER_H = 56;
const PANEL_W = 480;
const PANEL_H = 380;
const COLS = 3;
const ROWS = 2;
const GAP = 10;
export const SIXPACK_PNG_WIDTH = PANEL_W * COLS + GAP * 2;
export const SIXPACK_PNG_HEIGHT = HEADER_H + PANEL_H * ROWS + GAP;
const PLOT = { left: 44, right: 456, top: 32, bottom: 318 };

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
  closePath: () => void;
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
  return loadChartCanvas() as CanvasModule | null;
}

export type RenderSixpackPlotError = { error: "canvas_unavailable" };

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

function drawCard(
  ctx: Canvas2d,
  ox: number,
  oy: number,
  colors: ChartBrandColors
): void {
  ctx.fillStyle = colors.plotFill;
  ctx.fillRect(ox, oy, PANEL_W - GAP, PANEL_H - GAP);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 0.5, oy + 0.5, PANEL_W - GAP - 1, PANEL_H - GAP - 1);
}

function drawPanelTitle(
  ctx: Canvas2d,
  title: string,
  ox: number,
  oy: number,
  colors: ChartBrandColors
): void {
  ctx.fillStyle = colors.brand800;
  ctx.font = font(13, "bold");
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, ox + 12, oy + 8);
}

function drawAxis(
  ctx: Canvas2d,
  plot: { left: number; right: number; top: number; bottom: number },
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  xLabel: string,
  yLabel: string,
  colors: ChartBrandColors
): void {
  const y = scale(yMin, yMax, plot.bottom, plot.top);
  const x = scale(xMin, xMax, plot.left, plot.right);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);

  ctx.fillStyle = colors.axis;
  ctx.font = font(9);
  ctx.textAlign = "end";
  ctx.textBaseline = "middle";
  for (const tick of [yMin, (yMin + yMax) / 2, yMax]) {
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(plot.left, y(tick));
    ctx.lineTo(plot.right, y(tick));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.axis;
    ctx.fillText(formatLimit(tick), plot.left - 4, y(tick));
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xTicks = [xMin, (xMin + xMax) / 2, xMax];
  for (const tick of xTicks) {
    ctx.fillText(formatLimit(tick), x(tick), plot.bottom + 4);
  }
  ctx.font = font(10);
  ctx.fillText(xLabel, (plot.left + plot.right) / 2, plot.bottom + 16);

  ctx.save();
  ctx.translate(plot.left - 30, (plot.top + plot.bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function drawControlChart(
  ctx: Canvas2d,
  series: ControlChartSeries,
  ox: number,
  oy: number,
  colors: ChartBrandColors,
  xOffset = 1,
  xLabel = "Observation",
  yLabel = "Value",
  spec?: {
    lsl: number | null;
    usl: number | null;
    showControlLimits?: boolean;
  }
): void {
  const plot = {
    left: ox + PLOT.left,
    right: ox + PLOT.right - GAP,
    top: oy + PLOT.top,
    bottom: oy + PLOT.bottom,
  };
  const showControlLimits = spec?.showControlLimits ?? true;
  const specValues = [spec?.lsl, spec?.usl].filter(
    (value): value is number => value != null && Number.isFinite(value)
  );
  const xs = series.values.map((_, i) => i + xOffset);
  const [yMin, yMax] = domain(
    [
      ...series.values,
      series.center,
      ...(showControlLimits ? [series.ucl, series.lcl] : []),
      ...specValues,
    ],
    0.12
  );
  const xMin = (xs[0] ?? 1) - 0.5;
  const xMax = (xs[xs.length - 1] ?? 1) + 0.5;
  const x = scale(xMin, xMax, plot.left, plot.right);
  const y = scale(yMin, yMax, plot.bottom, plot.top);
  const ooc = new Set(series.outOfControl);

  drawAxis(ctx, plot, xMin, xMax, yMin, yMax, xLabel, yLabel, colors);

  ctx.strokeStyle = colors.limit;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  for (const limit of specValues) {
    ctx.beginPath();
    ctx.moveTo(plot.left, y(limit));
    ctx.lineTo(plot.right, y(limit));
    ctx.stroke();
  }
  if (showControlLimits) {
    ctx.setLineDash([4, 3]);
    for (const limit of [series.ucl, series.lcl]) {
      ctx.beginPath();
      ctx.moveTo(plot.left, y(limit));
      ctx.lineTo(plot.right, y(limit));
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = colors.brand600;
  ctx.beginPath();
  ctx.moveTo(plot.left, y(series.center));
  ctx.lineTo(plot.right, y(series.center));
  ctx.stroke();

  ctx.strokeStyle = colors.brand800;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  series.values.forEach((value, i) => {
    const px = x(xs[i]!);
    const py = y(value);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  for (let i = 0; i < series.values.length; i++) {
    const value = series.values[i]!;
    ctx.beginPath();
    ctx.arc(x(xs[i]!), y(value), ooc.has(i) ? 3.2 : 2.2, 0, Math.PI * 2);
    ctx.fillStyle = ooc.has(i) ? colors.limit : colors.brand600;
    ctx.fill();
  }

  const controlLabels = showControlLimits
    ? layoutControlLimitLabels(
        [
          { kind: "ucl", value: series.ucl, lineY: y(series.ucl) },
          { kind: "lcl", value: series.lcl, lineY: y(series.lcl) },
        ],
        plot
      )
    : [];
  const specEdge = showControlLimits ? "left" : "right";
  const specLabels = layoutHorizontalSpecLabels(
    [
      ...(spec?.lsl != null
        ? [
            {
              kind: "lsl" as const,
              value: spec.lsl,
              lineY: y(spec.lsl),
              edge: specEdge,
            },
          ]
        : []),
      ...(spec?.usl != null
        ? [
            {
              kind: "usl" as const,
              value: spec.usl,
              lineY: y(spec.usl),
              edge: specEdge,
            },
          ]
        : []),
    ],
    plot
  );
  ctx.font = font(9, "bold");
  ctx.fillStyle = colors.limit;
  ctx.textBaseline = "alphabetic";
  for (const label of [...controlLabels, ...specLabels]) {
    ctx.textAlign = canvasTextAlign(label.textAnchor);
    ctx.fillText(label.text, label.x, label.y);
  }
}

function drawHistogram(
  ctx: Canvas2d,
  bins: HistogramBin[],
  overallCurve: CurvePoint[],
  withinCurve: CurvePoint[],
  lsl: number | null,
  usl: number | null,
  ox: number,
  oy: number,
  colors: ChartBrandColors
): void {
  const plot = {
    left: ox + PLOT.left,
    right: ox + PLOT.right - GAP,
    top: oy + PLOT.top,
    bottom: oy + PLOT.bottom,
  };
  const counts = bins.map((bin) => bin.count);
  const curveYs = [...overallCurve, ...withinCurve].map((point) => point.y);
  const xValues = [
    ...bins.flatMap((bin) => [bin.x0, bin.x1]),
    ...overallCurve.map((point) => point.x),
    ...(lsl != null ? [lsl] : []),
    ...(usl != null ? [usl] : []),
  ];
  const [xMin, xMax] = domain(xValues, 0.02);
  const yMax = Math.max(1, ...counts, ...curveYs) * 1.12;
  const x = scale(xMin, xMax, plot.left, plot.right);
  const y = scale(0, yMax, plot.bottom, plot.top);

  drawAxis(ctx, plot, xMin, xMax, 0, yMax, "Measurement", "Frequency", colors);

  for (const bin of bins) {
    const w = Math.max(1, x(bin.x1) - x(bin.x0) - 1);
    ctx.fillStyle = colors.brand400;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x(bin.x0), y(bin.count), w, plot.bottom - y(bin.count));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.brand500;
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x(bin.x0), y(bin.count), w, plot.bottom - y(bin.count));
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
  drawCurve(withinCurve, colors.brand600);
  drawCurve(overallCurve, colors.axis, [4, 3]);

  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = colors.limit;
  ctx.lineWidth = 1;
  for (const limit of [lsl, usl]) {
    if (limit == null) continue;
    ctx.beginPath();
    ctx.moveTo(x(limit), plot.top);
    ctx.lineTo(x(limit), plot.bottom);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const specLabels = layoutSpecLimitLabels(
    [
      ...(lsl != null ? [{ kind: "lsl" as const, value: lsl, lineX: x(lsl) }] : []),
      ...(usl != null ? [{ kind: "usl" as const, value: usl, lineX: x(usl) }] : []),
    ],
    plot
  );
  ctx.font = font(9, "bold");
  ctx.fillStyle = colors.limit;
  ctx.textBaseline = "alphabetic";
  for (const label of specLabels) {
    ctx.textAlign = canvasTextAlign(label.textAnchor);
    ctx.fillText(label.text, label.x, label.y);
  }
}

function drawNormalPlot(
  ctx: Canvas2d,
  points: ProbabilityPlotPoint[],
  lineStart: ProbabilityPlotPoint,
  lineEnd: ProbabilityPlotPoint,
  lowerBand: ProbabilityPlotPoint[],
  upperBand: ProbabilityPlotPoint[],
  ad: number,
  pValue: number,
  ox: number,
  oy: number,
  colors: ChartBrandColors
): void {
  const plot = {
    left: ox + PLOT.left,
    right: ox + PLOT.right - GAP,
    top: oy + PLOT.top,
    bottom: oy + PLOT.bottom,
  };
  const zs = [
    ...points.map((point) => point.z),
    lineStart.z,
    lineEnd.z,
    ...lowerBand.map((point) => point.z),
  ];
  const vals = [
    ...points.map((point) => point.value),
    lineStart.value,
    lineEnd.value,
    ...lowerBand.map((point) => point.value),
    ...upperBand.map((point) => point.value),
  ];
  const [xMin, xMax] = domain(zs, 0.08);
  const [yMin, yMax] = domain(vals, 0.08);
  const x = scale(xMin, xMax, plot.left, plot.right);
  const y = scale(yMin, yMax, plot.bottom, plot.top);

  drawAxis(ctx, plot, xMin, xMax, yMin, yMax, "Normal score", "Value", colors);

  if (lowerBand.length > 1 && upperBand.length > 1) {
    ctx.fillStyle = colors.brand400;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    lowerBand.forEach((point, i) => {
      const px = x(point.z);
      const py = y(point.value);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    for (let i = upperBand.length - 1; i >= 0; i--) {
      const point = upperBand[i]!;
      ctx.lineTo(x(point.z), y(point.value));
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = colors.brand600;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(lineStart.z), y(lineStart.value));
  ctx.lineTo(x(lineEnd.z), y(lineEnd.value));
  ctx.stroke();

  for (const point of points) {
    ctx.beginPath();
    ctx.arc(x(point.z), y(point.value), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.brand800;
    ctx.fill();
  }

  ctx.fillStyle = colors.brand800;
  ctx.font = font(10);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(
    `AD: ${formatStat(ad, 3)}   P: ${formatPValue(pValue)}`,
    plot.left + 6,
    plot.top + 4
  );
}

function drawStatColumn(
  ctx: Canvas2d,
  x: number,
  y: number,
  heading: string,
  rows: Array<[string, string]>,
  colors: ChartBrandColors,
  width: number
): number {
  ctx.fillStyle = colors.axis;
  ctx.font = font(10, "bold");
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(heading.toUpperCase(), x, y);
  let rowY = y + 16;
  for (const [label, value] of rows) {
    ctx.font = font(10);
    ctx.fillStyle = colors.axis;
    ctx.textAlign = "left";
    ctx.fillText(label, x, rowY);
    ctx.fillStyle = colors.brand800;
    ctx.textAlign = "right";
    ctx.fillText(value, x + width, rowY);
    rowY += 14;
  }
  return rowY;
}

function drawCapabilityText(
  ctx: Canvas2d,
  result: CapabilitySixpackResult,
  ox: number,
  oy: number,
  colors: ChartBrandColors
): void {
  const cap = result.capability;
  const colW = (PANEL_W - GAP - 36) / 2;
  const leftX = ox + 16;
  const rightX = ox + 18 + colW;
  const top = oy + 32;
  const processRows: Array<[string, string]> = [
    ["Sample N", String(result.n)],
    ...(result.skipped > 0
      ? ([["Skipped", String(result.skipped)]] as Array<[string, string]>)
      : []),
    ["Mean", formatStat(result.mean)],
    ["StDev (overall)", formatStat(result.overallStdev)],
    ["StDev (within)", formatStat(result.withinStdev)],
    ["MR̄", formatStat(result.mrBar)],
    ["LSL", formatStat(cap.lsl)],
    ["Target", formatStat(cap.target)],
    ["USL", formatStat(cap.usl)],
  ];
  drawStatColumn(ctx, leftX, top, "Process data", processRows, colors, colW - 8);
  const afterPotential = drawStatColumn(
    ctx,
    rightX,
    top,
    "Potential (within)",
    [
      ["Cp", formatStat(cap.cp)],
      ["CPL", formatStat(cap.cpl)],
      ["CPU", formatStat(cap.cpu)],
      ["Cpk", formatStat(cap.cpk)],
      ["PPM (exp.)", formatPpm(cap.ppmWithin)],
    ],
    colors,
    colW - 8
  );
  drawStatColumn(
    ctx,
    rightX,
    afterPotential + 8,
    "Overall",
    [
      ["Pp", formatStat(cap.pp)],
      ["PPL", formatStat(cap.ppl)],
      ["PPU", formatStat(cap.ppu)],
      ["Ppk", formatStat(cap.ppk)],
      ["PPM (exp.)", formatPpm(cap.ppmOverall)],
      ["PPM (obs.)", formatPpm(cap.ppmObserved)],
    ],
    colors,
    colW - 8
  );
}

export function renderSixpackPng(
  analysis: SixpackAnalysisSummary,
  options: {
    loadCanvas?: () => CanvasModule | null;
    packId?: ReturnType<typeof resolveCustomerId>;
  } = {}
): Buffer | RenderSixpackPlotError {
  const load = options.loadCanvas ?? defaultLoadCanvas;
  const canvasMod = load();
  if (!canvasMod) return { error: "canvas_unavailable" };

  const colors = chartBrandColors(options.packId ?? resolveCustomerId());
  const canvas = canvasMod.createCanvas(SIXPACK_PNG_WIDTH, SIXPACK_PNG_HEIGHT);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "canvas_unavailable" };

  const { results, config, title } = analysis;
  ctx.fillStyle = PAGE_FILL;
  ctx.fillRect(0, 0, SIXPACK_PNG_WIDTH, SIXPACK_PNG_HEIGHT);

  ctx.fillStyle = colors.brand800;
  ctx.font = font(16, "bold");
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(
    `Process Capability Sixpack of ${config.columnName}`,
    GAP + 4,
    10
  );
  ctx.fillStyle = colors.axis;
  ctx.font = font(11);
  ctx.fillText(`${title} · Normal · Individuals / I-MR`, GAP + 4, 32);

  const panels: Array<{ title: string; draw: (ox: number, oy: number) => void }> =
    [
      {
        title: "I Chart",
        draw: (ox, oy) =>
          drawControlChart(
            ctx,
            results.individuals,
            ox,
            oy,
            colors,
            1,
            "Observation",
            "Individual",
            {
              lsl: results.capability.lsl,
              usl: results.capability.usl,
            }
          ),
      },
      {
        title: "Last 25 Observations",
        draw: (ox, oy) =>
          drawControlChart(
            ctx,
            {
              values: results.lastObservations,
              center: results.mean,
              ucl: results.individuals.ucl,
              lcl: results.individuals.lcl,
              outOfControl: [],
            },
            ox,
            oy,
            colors,
            Math.max(1, results.n - results.lastObservations.length + 1),
            "Observation",
            "Value",
            {
              lsl: results.capability.lsl,
              usl: results.capability.usl,
              showControlLimits: false,
            }
          ),
      },
      {
        title: "Capability Histogram",
        draw: (ox, oy) =>
          drawHistogram(
            ctx,
            results.histogram.bins,
            results.histogram.overallCurve,
            results.histogram.withinCurve,
            results.capability.lsl,
            results.capability.usl,
            ox,
            oy,
            colors
          ),
      },
      {
        title: "Moving Range Chart",
        draw: (ox, oy) =>
          drawControlChart(
            ctx,
            results.movingRange,
            ox,
            oy,
            colors,
            2,
            "Observation",
            "Moving range"
          ),
      },
      {
        title: "Normal Probability Plot",
        draw: (ox, oy) =>
          drawNormalPlot(
            ctx,
            results.normalPlot.points,
            results.normalPlot.lineStart,
            results.normalPlot.lineEnd,
            results.normalPlot.lowerBand,
            results.normalPlot.upperBand,
            results.normalPlot.ad,
            results.normalPlot.pValue,
            ox,
            oy,
            colors
          ),
      },
      {
        title: "Process Capability",
        draw: (ox, oy) => drawCapabilityText(ctx, results, ox, oy, colors),
      },
    ];

  panels.forEach((panel, index) => {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const ox = GAP + col * PANEL_W;
    const oy = HEADER_H + row * PANEL_H;
    drawCard(ctx, ox, oy, colors);
    drawPanelTitle(ctx, panel.title, ox, oy, colors);
    panel.draw(ox, oy);
  });

  return canvas.toBuffer("image/png");
}
