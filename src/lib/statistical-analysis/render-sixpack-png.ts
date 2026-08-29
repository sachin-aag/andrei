import { chartBrandColors } from "@/lib/charts/brand-colors";
import type { ChartBrandColors } from "@/lib/charts/brand-colors";
import { resolveCustomerId } from "@/lib/customers/resolve";
import { formatPpm, formatPValue, formatStat } from "./format";
import type {
  CapabilitySixpackResult,
  ControlChartSeries,
  CurvePoint,
  HistogramBin,
  ProbabilityPlotPoint,
  SixpackAnalysisSummary,
} from "./types";

const PANEL_W = 480;
const PANEL_H = 360;
const COLS = 3;
const ROWS = 2;
const OUT_W = PANEL_W * COLS;
const OUT_H = PANEL_H * ROWS;
const PLOT = { left: 48, right: 452, top: 28, bottom: 300 };

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

function drawPanelTitle(
  ctx: Canvas2d,
  title: string,
  ox: number,
  oy: number,
  colors: ChartBrandColors
): void {
  ctx.fillStyle = colors.brand800;
  ctx.font = "bold 13px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, ox + 8, oy + 6);
}

function drawControlChart(
  ctx: Canvas2d,
  series: ControlChartSeries,
  ox: number,
  oy: number,
  colors: ChartBrandColors,
  xOffset = 1,
  xLabel = "Observation",
  yLabel = "Value"
): void {
  const left = ox + PLOT.left;
  const right = ox + PLOT.right;
  const top = oy + PLOT.top;
  const bottom = oy + PLOT.bottom;
  const xs = series.values.map((_, i) => i + xOffset);
  const [yMin, yMax] = domain(
    [...series.values, series.ucl, series.lcl, series.center],
    0.12
  );
  const xMin = (xs[0] ?? 1) - 0.5;
  const xMax = (xs[xs.length - 1] ?? 1) + 0.5;
  const x = scale(xMin, xMax, left, right);
  const y = scale(yMin, yMax, bottom, top);
  const ooc = new Set(series.outOfControl);

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, right - left, bottom - top);

  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = colors.limit;
  for (const limit of [series.ucl, series.lcl]) {
    ctx.beginPath();
    ctx.moveTo(left, y(limit));
    ctx.lineTo(right, y(limit));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = colors.brand600;
  ctx.beginPath();
  ctx.moveTo(left, y(series.center));
  ctx.lineTo(right, y(series.center));
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

  ctx.fillStyle = colors.axis;
  ctx.font = "10px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(xLabel, (left + right) / 2, bottom + 8);
  ctx.save();
  ctx.translate(left - 28, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
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
  const left = ox + PLOT.left;
  const right = ox + PLOT.right;
  const top = oy + PLOT.top;
  const bottom = oy + PLOT.bottom;
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
  const x = scale(xMin, xMax, left, right);
  const y = scale(0, yMax, bottom, top);

  ctx.strokeStyle = colors.grid;
  ctx.strokeRect(left, top, right - left, bottom - top);

  for (const bin of bins) {
    const w = Math.max(1, x(bin.x1) - x(bin.x0));
    const h = bottom - y(bin.count);
    ctx.fillStyle = colors.brand400;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x(bin.x0), y(bin.count), w, h);
    ctx.globalAlpha = 1;
  }

  const drawCurve = (points: CurvePoint[], stroke: string) => {
    if (points.length < 2) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    points.forEach((point, i) => {
      const px = x(point.x);
      const py = y(point.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
  drawCurve(overallCurve, colors.brand800);
  drawCurve(withinCurve, colors.brand600);

  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = colors.limit;
  for (const limit of [lsl, usl]) {
    if (limit == null) continue;
    ctx.beginPath();
    ctx.moveTo(x(limit), top);
    ctx.lineTo(x(limit), bottom);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawNormalPlot(
  ctx: Canvas2d,
  points: ProbabilityPlotPoint[],
  lineStart: ProbabilityPlotPoint,
  lineEnd: ProbabilityPlotPoint,
  ad: number,
  pValue: number,
  ox: number,
  oy: number,
  colors: ChartBrandColors
): void {
  const left = ox + PLOT.left;
  const right = ox + PLOT.right;
  const top = oy + PLOT.top;
  const bottom = oy + PLOT.bottom;
  const zs = points.map((point) => point.z);
  const vals = points.map((point) => point.value);
  const [xMin, xMax] = domain(zs);
  const [yMin, yMax] = domain(vals);
  const x = scale(xMin, xMax, left, right);
  const y = scale(yMin, yMax, bottom, top);

  ctx.strokeStyle = colors.grid;
  ctx.strokeRect(left, top, right - left, bottom - top);

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

  ctx.fillStyle = colors.axis;
  ctx.font = "10px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`AD ${formatStat(ad, 3)} · p ${formatPValue(pValue)}`, left, top + 4);
}

function drawCapabilityText(
  ctx: Canvas2d,
  result: CapabilitySixpackResult,
  ox: number,
  oy: number,
  colors: ChartBrandColors
): void {
  const cap = result.capability;
  const lines = [
    `N = ${result.n}`,
    `Mean = ${formatStat(result.mean)}`,
    `StDev (within) = ${formatStat(result.withinStdev)}`,
    `Cp = ${formatStat(cap.cp)}`,
    `Cpk = ${formatStat(cap.cpk)}`,
    `Pp = ${formatStat(cap.pp)}`,
    `Ppk = ${formatStat(cap.ppk)}`,
    `PPM (exp.) = ${formatPpm(cap.ppmOverall)}`,
    `LSL = ${formatStat(cap.lsl)}`,
    `USL = ${formatStat(cap.usl)}`,
  ];
  ctx.fillStyle = colors.brand800;
  ctx.font = "12px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let y = oy + 40;
  for (const line of lines) {
    ctx.fillText(line, ox + 16, y);
    y += 18;
  }
}

export function renderSixpackPng(
  analysis: SixpackAnalysisSummary,
  options: { loadCanvas?: () => CanvasModule | null; packId?: ReturnType<typeof resolveCustomerId> } = {}
): Buffer | RenderSixpackPlotError {
  const load = options.loadCanvas ?? defaultLoadCanvas;
  const canvasMod = load();
  if (!canvasMod) return { error: "canvas_unavailable" };

  const colors = chartBrandColors(options.packId ?? resolveCustomerId());
  const canvas = canvasMod.createCanvas(OUT_W, OUT_H);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "canvas_unavailable" };

  const { results } = analysis;
  ctx.fillStyle = colors.plotFill;
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  const panels: Array<{ title: string; draw: () => void }> = [
    {
      title: "I Chart",
      draw: () =>
        drawControlChart(
          ctx,
          results.individuals,
          0,
          0,
          colors,
          1,
          "Observation",
          "Individual"
        ),
    },
    {
      title: "Last 25 Observations",
      draw: () =>
        drawControlChart(
          ctx,
          {
            values: results.lastObservations,
            center: results.mean,
            ucl: results.individuals.ucl,
            lcl: results.individuals.lcl,
            outOfControl: [],
          },
          PANEL_W,
          0,
          colors,
          Math.max(1, results.n - results.lastObservations.length + 1),
          "Observation",
          "Value"
        ),
    },
    {
      title: "Capability Histogram",
      draw: () =>
        drawHistogram(
          ctx,
          results.histogram.bins,
          results.histogram.overallCurve,
          results.histogram.withinCurve,
          results.capability.lsl,
          results.capability.usl,
          PANEL_W * 2,
          0,
          colors
        ),
    },
    {
      title: "Moving Range Chart",
      draw: () =>
        drawControlChart(
          ctx,
          results.movingRange,
          0,
          PANEL_H,
          colors,
          2,
          "Observation",
          "Moving range"
        ),
    },
    {
      title: "Normal Probability Plot",
      draw: () =>
        drawNormalPlot(
          ctx,
          results.normalPlot.points,
          results.normalPlot.lineStart,
          results.normalPlot.lineEnd,
          results.normalPlot.ad,
          results.normalPlot.pValue,
          PANEL_W,
          PANEL_H,
          colors
        ),
    },
    {
      title: "Process Capability",
      draw: () => drawCapabilityText(ctx, results, PANEL_W * 2, PANEL_H, colors),
    },
  ];

  panels.forEach((panel, index) => {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const ox = col * PANEL_W;
    const oy = row * PANEL_H;
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, PANEL_W - 1, PANEL_H - 1);
    drawPanelTitle(ctx, panel.title, ox, oy, colors);
    panel.draw();
  });

  return canvas.toBuffer("image/png");
}
