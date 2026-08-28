import { CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS } from "@/lib/ai/chat/section-images";
import { chartBrandColors, type ChartBrandColors } from "@/lib/charts/brand-colors";
import { CHART_DISPLAY_WIDTH_PX } from "@/lib/charts/render-chart";
import { resolveCustomerId, type CustomerId } from "@/lib/customers/resolve";
import { readRasterDimensions } from "@/lib/export/raster-dimensions";
import { formatPpm, formatPValue, formatStat } from "@/lib/statistical-analysis/format";
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
  globalAlpha: number;
  setLineDash: (segments: number[]) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  arc: (x: number, y: number, r: number, start: number, end: number) => void;
  closePath: () => void;
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

const MARGIN = 8;
const HEADER_HEIGHT = 40;
const PANEL_GAP = 8;
const PANEL_HEIGHT = 228;
const COLS = 3;

export const SIXPACK_LOGICAL_WIDTH = 960;
export const SIXPACK_LOGICAL_HEIGHT =
  MARGIN + HEADER_HEIGHT + PANEL_GAP + PANEL_HEIGHT + PANEL_GAP + PANEL_HEIGHT + MARGIN;

export type RenderedSixpack = {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
};

export type RenderSixpackError = { error: "canvas_unavailable" | "too_large" };

type PanelRect = { x: number; y: number; w: number; h: number };

type PlotArea = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function panelWidth(): number {
  return (
    (SIXPACK_LOGICAL_WIDTH - MARGIN * 2 - PANEL_GAP * (COLS - 1)) / COLS
  );
}

function panelAt(col: number, row: number): PanelRect {
  const w = panelWidth();
  return {
    x: MARGIN + col * (w + PANEL_GAP),
    y: MARGIN + HEADER_HEIGHT + PANEL_GAP + row * (PANEL_HEIGHT + PANEL_GAP),
    w,
    h: PANEL_HEIGHT,
  };
}

function plotArea(panel: PanelRect): PlotArea {
  return {
    left: 36,
    right: panel.w - 10,
    top: 24,
    bottom: panel.h - 28,
  };
}

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

function drawPanelFrame(
  ctx: Canvas2d,
  panel: PanelRect,
  title: string,
  colors: ChartBrandColors
) {
  ctx.fillStyle = colors.plotFill;
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1);
  ctx.fillStyle = colors.brand800;
  ctx.font = "bold 11px Arimo, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, panel.x + 6, panel.y + 6);
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
  const plot = plotArea(panel);
  ctx.save();
  ctx.translate(panel.x, panel.y);
  const y = scale(yMin, yMax, plot.bottom, plot.top);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, plot.bottom);
  ctx.lineTo(plot.right, plot.bottom);
  ctx.stroke();
  ctx.restore();
}

function drawControlChart(
  ctx: Canvas2d,
  panel: PanelRect,
  series: ControlChartSeries,
  colors: ChartBrandColors,
  title: string,
  xOffset = 1
) {
  drawPanelFrame(ctx, panel, title, colors);
  const xs = series.values.map((_, i) => i + xOffset);
  const [yMin, yMax] = domain(
    [...series.values, series.ucl, series.lcl, series.center],
    0.12
  );
  const xMin = (xs[0] ?? 1) - 0.5;
  const xMax = (xs[xs.length - 1] ?? 1) + 0.5;
  drawAxes(ctx, panel, xMin, xMax, yMin, yMax, colors);
  const plot = plotArea(panel);
  ctx.save();
  ctx.translate(panel.x, panel.y);
  const x = scale(xMin, xMax, plot.left, plot.right);
  const y = scale(yMin, yMax, plot.bottom, plot.top);
  const ooc = new Set(series.outOfControl);
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = colors.limit;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.left, y(series.ucl));
  ctx.lineTo(plot.right, y(series.ucl));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(plot.left, y(series.lcl));
  ctx.lineTo(plot.right, y(series.lcl));
  ctx.stroke();
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
  drawPanelFrame(ctx, panel, "Capability Histogram", colors);
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
  const plot = plotArea(panel);
  ctx.save();
  ctx.translate(panel.x, panel.y);
  const x = scale(xMin, xMax, plot.left, plot.right);
  const y = scale(0, yMax, plot.bottom, plot.top);
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
    ctx.moveTo(x(limit), plot.top);
    ctx.lineTo(x(limit), plot.bottom);
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
  lowerBand: ProbabilityPlotPoint[],
  upperBand: ProbabilityPlotPoint[],
  ad: number,
  pValue: number,
  colors: ChartBrandColors
) {
  drawPanelFrame(ctx, panel, "Normal Probability Plot", colors);
  const zs = [
    ...points.map((point) => point.z),
    lineStart.z,
    lineEnd.z,
    ...lowerBand.map((point) => point.z),
    ...upperBand.map((point) => point.z),
  ];
  const ys = [
    ...points.map((point) => point.value),
    lineStart.value,
    lineEnd.value,
    ...lowerBand.map((point) => point.value),
    ...upperBand.map((point) => point.value),
  ];
  const [xMin, xMax] = domain(zs, 0.08);
  const [yMin, yMax] = domain(ys, 0.08);
  drawAxes(ctx, panel, xMin, xMax, yMin, yMax, colors);
  const plot = plotArea(panel);
  ctx.save();
  ctx.translate(panel.x, panel.y);
  const x = scale(xMin, xMax, plot.left, plot.right);
  const y = scale(yMin, yMax, plot.bottom, plot.top);
  const band = [
    ...lowerBand.map((point) => `${x(point.z)},${y(point.value)}`),
    ...upperBand
      .toReversed()
      .map((point) => `${x(point.z)},${y(point.value)}`),
  ].join(" ");
  if (band.length > 0) {
    ctx.fillStyle = colors.brand400;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    const [first, ...rest] = band.split(" ");
    const [fx, fy] = first!.split(",").map(Number);
    ctx.moveTo(fx!, fy!);
    rest.forEach((pair) => {
      const [px, py] = pair.split(",").map(Number);
      ctx.lineTo(px!, py!);
    });
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
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
    plot.left + 4,
    plot.top + 4
  );
  ctx.restore();
}

function drawCapabilitySummary(
  ctx: Canvas2d,
  panel: PanelRect,
  result: CapabilitySixpackResult,
  colors: ChartBrandColors
) {
  drawPanelFrame(ctx, panel, "Process Capability", colors);
  const cap = result.capability;
  const leftCol = [
    "PROCESS DATA",
    `Sample N  ${result.n}`,
    ...(result.skipped > 0 ? [`Skipped  ${result.skipped}`] : []),
    `Mean  ${formatStat(result.mean)}`,
    `StDev (overall)  ${formatStat(result.overallStdev)}`,
    `StDev (within)  ${formatStat(result.withinStdev)}`,
    `MR̄  ${formatStat(result.mrBar)}`,
    `LSL  ${formatStat(cap.lsl)}`,
    `Target  ${formatStat(cap.target)}`,
    `USL  ${formatStat(cap.usl)}`,
  ];
  const rightCol = [
    "POTENTIAL (WITHIN)",
    `Cp  ${formatStat(cap.cp)}`,
    `CPL  ${formatStat(cap.cpl)}`,
    `CPU  ${formatStat(cap.cpu)}`,
    `Cpk  ${formatStat(cap.cpk)}`,
    `PPM (exp.)  ${formatPpm(cap.ppmWithin)}`,
    "",
    "OVERALL",
    `Pp  ${formatStat(cap.pp)}`,
    `PPL  ${formatStat(cap.ppl)}`,
    `PPU  ${formatStat(cap.ppu)}`,
    `Ppk  ${formatStat(cap.ppk)}`,
    `PPM (exp.)  ${formatPpm(cap.ppmOverall)}`,
    `PPM (obs.)  ${formatPpm(cap.ppmObserved)}`,
  ];
  ctx.font = "9px Arimo, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const colWidth = (panel.w - 16) / 2;
  [leftCol, rightCol].forEach((lines, col) => {
    lines.forEach((line, i) => {
      if (!line) return;
      const isHeader = line === line.toUpperCase() && !line.includes("  ");
      ctx.fillStyle = isHeader ? colors.axis : colors.brand800;
      ctx.font = isHeader
        ? "bold 8px Arimo, Helvetica, Arial, sans-serif"
        : "9px Arimo, Helvetica, Arial, sans-serif";
      ctx.fillText(line, panel.x + 8 + col * colWidth, panel.y + 24 + i * 12);
    });
  });
}

function drawSixpack(
  ctx: Canvas2d,
  analysis: SixpackAnalysisSummary,
  colors: ChartBrandColors
) {
  const { config, results } = analysis;
  ctx.fillStyle = "#f4f6f9";
  ctx.fillRect(0, 0, SIXPACK_LOGICAL_WIDTH, SIXPACK_LOGICAL_HEIGHT);
  ctx.fillStyle = colors.brand800;
  ctx.font = "bold 14px Arimo, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(
    `Process Capability Sixpack of ${config.columnName}`,
    MARGIN,
    10
  );
  ctx.fillStyle = colors.axis;
  ctx.font = "10px Arimo, Helvetica, Arial, sans-serif";
  ctx.fillText(`${analysis.title} · Normal · Individuals / I-MR`, MARGIN, 26);

  const last25Offset = Math.max(1, results.n - results.lastObservations.length + 1);
  const last25Series: ControlChartSeries = {
    values: results.lastObservations,
    center: results.mean,
    ucl: results.individuals.ucl,
    lcl: results.individuals.lcl,
    outOfControl: [],
  };

  // Match SixpackView grid order: row 1 then row 2, left to right.
  drawControlChart(ctx, panelAt(0, 0), results.individuals, colors, "I Chart", 1);
  drawControlChart(
    ctx,
    panelAt(1, 0),
    last25Series,
    colors,
    "Last 25 Observations",
    last25Offset
  );
  drawHistogram(
    ctx,
    panelAt(2, 0),
    results.histogram.bins,
    results.histogram.overallCurve,
    results.histogram.withinCurve,
    results.capability.lsl,
    results.capability.usl,
    colors
  );
  drawControlChart(
    ctx,
    panelAt(0, 1),
    results.movingRange,
    colors,
    "Moving Range Chart",
    2
  );
  drawNormalPlot(
    ctx,
    panelAt(1, 1),
    results.normalPlot.points,
    results.normalPlot.lineStart,
    results.normalPlot.lineEnd,
    results.normalPlot.lowerBand,
    results.normalPlot.upperBand,
    results.normalPlot.ad,
    results.normalPlot.pValue,
    colors
  );
  drawCapabilitySummary(ctx, panelAt(2, 1), results, colors);
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
