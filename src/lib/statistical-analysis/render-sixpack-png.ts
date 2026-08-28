import { CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS } from "@/lib/ai/chat/section-images";
import { chartBrandColors, type ChartBrandColors } from "@/lib/charts/brand-colors";
import { CHART_DISPLAY_WIDTH_PX } from "@/lib/charts/render-chart";
import { resolveCustomerId, type CustomerId } from "@/lib/customers/resolve";
import { readRasterDimensions } from "@/lib/export/raster-dimensions";
import { formatPValue, formatStat } from "@/lib/statistical-analysis/format";
import { isValidSuggestionImageSrc } from "@/lib/suggestions/image-insert";
import type {
  CapabilitySixpackResult,
  ControlChartSeries,
  CurvePoint,
  HistogramBin,
  ProbabilityPlotPoint,
  SixpackAnalysisSummary,
} from "@/lib/statistical-analysis/types";

type Canvas2d = {
  fillStyle: string;
  strokeStyle: string;
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
  scale: (x: number, y: number) => void;
};

type CanvasModule = {
  createCanvas: (width: number, height: number) => {
    getContext: (type: "2d") => Canvas2d | null;
    toBuffer: (mime: string) => Buffer;
  };
};

export const SIXPACK_LOGICAL_WIDTH = 960;
export const SIXPACK_LOGICAL_HEIGHT = 720;

export type RenderedSixpack = {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
};

export type RenderSixpackError = { error: "canvas_unavailable" | "too_large" };

type PanelRect = { x: number; y: number; w: number; h: number };

const PANELS: PanelRect[] = [
  { x: 8, y: 36, w: 312, h: 200 },
  { x: 324, y: 36, w: 312, h: 200 },
  { x: 640, y: 36, w: 312, h: 200 },
  { x: 8, y: 248, w: 312, h: 200 },
  { x: 324, y: 248, w: 312, h: 200 },
  { x: 640, y: 248, w: 312, h: 200 },
];

const PLOT = { left: 36, right: 288, top: 24, bottom: 168 };

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
  panel: PanelRect,
  title: string,
  colors: ChartBrandColors
) {
  ctx.fillStyle = colors.axis;
  ctx.font = "bold 11px Arimo, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, panel.x + 4, panel.y + 4);
}

function drawAxes(
  ctx: Canvas2d,
  panel: PanelRect,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  colors: ChartBrandColors
) {
  ctx.save();
  ctx.translate(panel.x, panel.y);
  const y = scale(yMin, yMax, PLOT.bottom, PLOT.top);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PLOT.left, PLOT.top);
  ctx.lineTo(PLOT.left, PLOT.bottom);
  ctx.lineTo(PLOT.right, PLOT.bottom);
  ctx.stroke();
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(PLOT.left, y(0));
  ctx.lineTo(PLOT.right, y(0));
  ctx.stroke();
  ctx.restore();
}

function drawControlChart(
  ctx: Canvas2d,
  panel: PanelRect,
  series: ControlChartSeries,
  colors: ChartBrandColors,
  title: string
) {
  drawPanelTitle(ctx, panel, title, colors);
  const xs = series.values.map((_, i) => i + 1);
  const [yMin, yMax] = domain(
    [...series.values, series.ucl, series.lcl, series.center],
    0.12
  );
  const xMin = (xs[0] ?? 1) - 0.5;
  const xMax = (xs[xs.length - 1] ?? 1) + 0.5;
  drawAxes(ctx, panel, xMin, xMax, yMin, yMax, colors);
  ctx.save();
  ctx.translate(panel.x, panel.y);
  const x = scale(xMin, xMax, PLOT.left, PLOT.right);
  const y = scale(yMin, yMax, PLOT.bottom, PLOT.top);
  const ooc = new Set(series.outOfControl);
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = colors.limit;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PLOT.left, y(series.ucl));
  ctx.lineTo(PLOT.right, y(series.ucl));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(PLOT.left, y(series.lcl));
  ctx.lineTo(PLOT.right, y(series.lcl));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = colors.brand600;
  ctx.beginPath();
  ctx.moveTo(PLOT.left, y(series.center));
  ctx.lineTo(PLOT.right, y(series.center));
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
  series.values.forEach((value, i) => {
    ctx.beginPath();
    ctx.arc(x(xs[i]!), y(value), ooc.has(i) ? 3.2 : 2.2, 0, Math.PI * 2);
    ctx.fillStyle = ooc.has(i) ? colors.limit : colors.brand600;
    ctx.fill();
  });
  ctx.restore();
}

function drawHistogram(
  ctx: Canvas2d,
  panel: PanelRect,
  bins: HistogramBin[],
  overallCurve: CurvePoint[],
  withinCurve: CurvePoint[],
  lsl: number | null,
  usl: number | null,
  colors: ChartBrandColors
) {
  drawPanelTitle(ctx, panel, "Capability histogram", colors);
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
  drawAxes(ctx, panel, xMin, xMax, 0, yMax, colors);
  ctx.save();
  ctx.translate(panel.x, panel.y);
  const x = scale(xMin, xMax, PLOT.left, PLOT.right);
  const y = scale(0, yMax, PLOT.bottom, PLOT.top);
  bins.forEach((bin) => {
    const width = Math.max(0.5, x(bin.x1) - x(bin.x0) - 1);
    const height = Math.max(0, y(0) - y(bin.count));
    ctx.fillStyle = colors.brand400;
    ctx.fillRect(x(bin.x0), y(bin.count), width, height);
    ctx.strokeStyle = colors.brand500;
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x(bin.x0), y(bin.count), width, height);
  });
  const drawCurve = (points: CurvePoint[], dashed: boolean) => {
    if (points.length === 0) return;
    ctx.beginPath();
    points.forEach((point, i) => {
      const px = x(point.x);
      const py = y(point.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = dashed ? colors.axis : colors.brand600;
    ctx.lineWidth = dashed ? 1.2 : 1.3;
    ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  drawCurve(withinCurve, false);
  drawCurve(overallCurve, true);
  [lsl, usl].forEach((limit) => {
    if (limit == null) return;
    ctx.setLineDash([3, 2]);
    ctx.strokeStyle = colors.limit;
    ctx.beginPath();
    ctx.moveTo(x(limit), PLOT.top);
    ctx.lineTo(x(limit), PLOT.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.restore();
}

function drawNormalPlot(
  ctx: Canvas2d,
  panel: PanelRect,
  points: ProbabilityPlotPoint[],
  lineStart: ProbabilityPlotPoint,
  lineEnd: ProbabilityPlotPoint,
  ad: number,
  pValue: number,
  colors: ChartBrandColors
) {
  drawPanelTitle(ctx, panel, "Normal probability plot", colors);
  const zs = points.map((point) => point.z);
  const ys = points.map((point) => point.value);
  const [xMin, xMax] = domain([...zs, lineStart.z, lineEnd.z], 0.08);
  const [yMin, yMax] = domain([...ys, lineStart.value, lineEnd.value], 0.08);
  drawAxes(ctx, panel, xMin, xMax, yMin, yMax, colors);
  ctx.save();
  ctx.translate(panel.x, panel.y);
  const x = scale(xMin, xMax, PLOT.left, PLOT.right);
  const y = scale(yMin, yMax, PLOT.bottom, PLOT.top);
  ctx.strokeStyle = colors.brand600;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x(lineStart.z), y(lineStart.value));
  ctx.lineTo(x(lineEnd.z), y(lineEnd.value));
  ctx.stroke();
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(x(point.z), y(point.value), 2.2, 0, Math.PI * 2);
    ctx.fillStyle = colors.brand800;
    ctx.fill();
  });
  ctx.fillStyle = colors.brand800;
  ctx.font = "9px Arimo, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(
    `AD: ${formatStat(ad, 3)}   P: ${formatPValue(pValue)}`,
    PLOT.left + 6,
    PLOT.top + 4
  );
  ctx.restore();
}

function drawCapabilitySummary(
  ctx: Canvas2d,
  panel: PanelRect,
  result: CapabilitySixpackResult,
  colors: ChartBrandColors
) {
  drawPanelTitle(ctx, panel, "Capability summary", colors);
  const cap = result.capability;
  const lines = [
    `N = ${result.n}`,
    `Mean = ${formatStat(result.mean)}`,
    `StDev (within) = ${formatStat(result.withinStdev)}`,
    `Cp = ${formatStat(cap.cp)}`,
    `Cpk = ${formatStat(cap.cpk)}`,
    `Pp = ${formatStat(cap.pp)}`,
    `Ppk = ${formatStat(cap.ppk)}`,
    `LSL = ${formatStat(cap.lsl)}`,
    `USL = ${formatStat(cap.usl)}`,
  ];
  ctx.fillStyle = colors.brand800;
  ctx.font = "10px Arimo, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    ctx.fillText(line, panel.x + 8, panel.y + 28 + i * 16);
  });
}

function drawSixpack(
  ctx: Canvas2d,
  analysis: SixpackAnalysisSummary,
  colors: ChartBrandColors
) {
  const { config, results } = analysis;
  ctx.fillStyle = colors.plotFill;
  ctx.fillRect(0, 0, SIXPACK_LOGICAL_WIDTH, SIXPACK_LOGICAL_HEIGHT);
  ctx.fillStyle = colors.brand800;
  ctx.font = "bold 14px Arimo, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(analysis.title, 12, 10);
  ctx.fillStyle = colors.axis;
  ctx.font = "10px Arimo, Helvetica, Arial, sans-serif";
  ctx.fillText(config.columnName, 12, 28);

  drawControlChart(
    ctx,
    PANELS[0]!,
    results.individuals,
    colors,
    "Individuals chart"
  );
  drawControlChart(
    ctx,
    PANELS[1]!,
    results.movingRange,
    colors,
    "Moving range chart"
  );
  drawHistogram(
    ctx,
    PANELS[2]!,
    results.histogram.bins,
    results.histogram.overallCurve,
    results.histogram.withinCurve,
    config.lsl,
    config.usl,
    colors
  );
  drawNormalPlot(
    ctx,
    PANELS[3]!,
    results.normalPlot.points,
    results.normalPlot.lineStart,
    results.normalPlot.lineEnd,
    results.normalPlot.ad,
    results.normalPlot.pValue,
    colors
  );
  drawCapabilitySummary(ctx, PANELS[4]!, results, colors);
  drawPanelTitle(ctx, PANELS[5]!, "Last observations", colors);
  ctx.fillStyle = colors.brand800;
  ctx.font = "10px Arimo, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const last = results.lastObservations
    .map((value) => formatStat(value))
    .join(", ");
  ctx.fillText(last || "—", PANELS[5]!.x + 8, PANELS[5]!.y + 28);
}

function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function defaultLoadCanvas(): CanvasModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@napi-rs/canvas") as CanvasModule;
  } catch {
    return null;
  }
}

export async function renderSixpackPng(
  analysis: SixpackAnalysisSummary,
  options: { loadCanvas?: () => CanvasModule | null; packId?: CustomerId } = {}
): Promise<RenderedSixpack | RenderSixpackError> {
  const load = options.loadCanvas ?? defaultLoadCanvas;
  const canvasMod = load();
  if (!canvasMod) return { error: "canvas_unavailable" };

  const colors = chartBrandColors(options.packId ?? resolveCustomerId());
  const canvas = canvasMod.createCanvas(
    SIXPACK_LOGICAL_WIDTH * 2,
    SIXPACK_LOGICAL_HEIGHT * 2
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "canvas_unavailable" };

  ctx.save();
  ctx.scale(2, 2);
  drawSixpack(ctx, analysis, colors);
  ctx.restore();

  const bytes = canvas.toBuffer("image/png");
  const dataUrl = pngDataUrl(bytes);
  if (
    dataUrl.length > CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS ||
    !isValidSuggestionImageSrc(dataUrl)
  ) {
    return { error: "too_large" };
  }

  const dims = readRasterDimensions(bytes, "image/png");
  const widthPx = CHART_DISPLAY_WIDTH_PX;
  const heightPx = Math.round(
    (widthPx * SIXPACK_LOGICAL_HEIGHT) / SIXPACK_LOGICAL_WIDTH
  );

  return {
    dataUrl,
    widthPx,
    heightPx: dims
      ? Math.round((widthPx * dims.height) / dims.width)
      : heightPx,
  };
}
