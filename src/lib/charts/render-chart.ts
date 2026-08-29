import fs from "node:fs";
import path from "node:path";
import { CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS } from "@/lib/ai/chat/section-images";
import { chartBrandColors, seriesFill, type ChartBrandColors } from "@/lib/charts/brand-colors";
import {
  layoutPoints,
  resolveXRange,
  resolveYRange,
  xTickValues,
  yTickValues,
  type ChartPoint,
  type ChartSpec,
} from "@/lib/charts/chart-spec";
import { resolveCustomerId, type CustomerId } from "@/lib/customers/resolve";
import { readRasterDimensions } from "@/lib/export/raster-dimensions";
import {
  CHART_DISPLAY_WIDTH_PX,
  CHART_LOGICAL_HEIGHT,
  CHART_LOGICAL_WIDTH,
} from "@/lib/charts/chart-dimensions";
import { isValidSuggestionImageSrc } from "@/lib/suggestions/image-insert";

export {
  CHART_DISPLAY_WIDTH_PX,
  CHART_LOGICAL_HEIGHT,
  CHART_LOGICAL_WIDTH,
} from "@/lib/charts/chart-dimensions";

type Canvas2d = {
  scale: (x: number, y: number) => void;
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
  measureText: (text: string) => { width: number };
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
  GlobalFonts?: {
    registerFromPath: (filePath: string, nameAlias?: string) => unknown;
  };
};

export type RenderedChart = {
  /** PNG data URL, ready for SuggestionImageInsert.src */
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  rasterWidthPx: number;
  rasterHeightPx: number;
};

export type RenderChartError = { error: "canvas_unavailable" | "too_large" };

export type RenderChartOptions = {
  loadCanvas?: () => CanvasModule | null;
  packId?: CustomerId;
};

let fontsRegistered = false;

function registerChartFont(GlobalFonts: CanvasModule["GlobalFonts"]): void {
  if (fontsRegistered || !GlobalFonts) return;
  fontsRegistered = true;
  const filePath = path.join(
    process.cwd(),
    "src",
    "lib",
    "import",
    "fonts",
    "Arimo-Regular.ttf"
  );
  if (!fs.existsSync(filePath)) return;
  try {
    GlobalFonts.registerFromPath(filePath, "Arimo");
  } catch {
    // Fall through to the platform sans-serif.
  }
}

function defaultLoadCanvas(): CanvasModule | null {
  try {
    // Lazy require so the module still loads when the optional native binding
    // is missing — the caller surfaces canvas_unavailable instead of a blank PNG.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@napi-rs/canvas") as CanvasModule;
    registerChartFont(mod.GlobalFonts);
    return mod;
  } catch {
    return null;
  }
}

function fontFamily(): string {
  return "Arimo, Helvetica, Arial, sans-serif";
}

function uniqueSeries(points: ChartPoint[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const point of points) {
    const key = point.series ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  return ordered.toSorted((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

function formatTick(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

function drawChart(
  ctx: Canvas2d,
  spec: ChartSpec,
  colors: ChartBrandColors
): void {
  const points = layoutPoints(spec);
  const yRange = resolveYRange(spec);
  const yTicks = yTickValues({ ...spec, points });
  const xRange = resolveXRange({ ...spec, points });
  const xTicks = xTickValues({ ...spec, points });
  const seriesNames = uniqueSeries(points);
  const showLegend = spec.layout.seriesBy === "unit" && seriesNames.some((name) => name);
  const legendWidth = showLegend ? 168 : 0;

  const plotLeft = 88;
  const plotRight = CHART_LOGICAL_WIDTH - 28 - legendWidth;
  const plotTop = 64;
  const plotBottom = CHART_LOGICAL_HEIGHT - 72;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const xSpan = Math.max(1e-9, xRange.max - xRange.min);

  const xToPx = (x: number) =>
    plotLeft + ((x - xRange.min) / xSpan) * plotWidth;
  const yToPx = (y: number) =>
    plotBottom - ((y - yRange.min) / (yRange.max - yRange.min)) * plotHeight;

  ctx.fillStyle = colors.plotFill;
  ctx.fillRect(0, 0, CHART_LOGICAL_WIDTH, CHART_LOGICAL_HEIGHT);

  ctx.fillStyle = colors.brand800;
  ctx.font = `18px ${fontFamily()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(spec.title, (plotLeft + plotRight) / 2, 18);

  ctx.fillStyle = colors.axis;
  ctx.font = `12px ${fontFamily()}`;
  ctx.save();
  ctx.translate(22, (plotTop + plotBottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spec.yLabel || spec.uom, 0, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(spec.xLabel, (plotLeft + plotRight) / 2, plotBottom + 36);

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (const tick of yTicks) {
    const y = yToPx(tick);
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
  }

  for (const x of xTicks) {
    const px = xToPx(x);
    ctx.beginPath();
    ctx.moveTo(px, plotTop);
    ctx.lineTo(px, plotBottom);
    ctx.stroke();
  }

  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotTop);
  ctx.lineTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  ctx.fillStyle = colors.axis;
  ctx.font = `11px ${fontFamily()}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const tick of yTicks) {
    ctx.fillText(formatTick(tick), plotLeft - 8, yToPx(tick));
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const x of xTicks) {
    ctx.fillText(formatTick(x), xToPx(x), plotBottom + 8);
  }

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = colors.limit;
  ctx.lineWidth = 1.5;
  for (const limit of [spec.limits.lower, spec.limits.upper]) {
    if (limit == null) continue;
    const y = yToPx(limit);
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const seriesIndex = new Map(seriesNames.map((name, index) => [name, index]));
  for (const point of points) {
    const color =
      spec.layout.seriesBy === "unit"
        ? seriesFill(colors, seriesIndex.get(point.series ?? "") ?? 0)
        : colors.brand600;
    const px = xToPx(point.x);
    const py = yToPx(point.y);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.plotFill;
    ctx.stroke();
  }

  if (showLegend) {
    const legendX = plotRight + 16;
    let legendY = plotTop + 8;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `11px ${fontFamily()}`;
    for (const name of seriesNames) {
      if (!name) continue;
      const color = seriesFill(colors, seriesIndex.get(name) ?? 0);
      ctx.beginPath();
      ctx.arc(legendX + 6, legendY, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = colors.brand800;
      ctx.fillText(name, legendX + 16, legendY);
      legendY += 20;
    }
  }
}

function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function renderAtScale(
  spec: ChartSpec,
  scale: 1 | 2,
  canvasMod: CanvasModule,
  colors: ChartBrandColors
): Promise<RenderedChart | RenderChartError> {
  const canvas = canvasMod.createCanvas(
    CHART_LOGICAL_WIDTH * scale,
    CHART_LOGICAL_HEIGHT * scale
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "canvas_unavailable" };
  ctx.scale(scale, scale);
  drawChart(ctx, spec, colors);
  const bytes = canvas.toBuffer("image/png");
  const dataUrl = pngDataUrl(bytes);
  if (dataUrl.length > CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS) {
    return { error: "too_large" };
  }
  if (!isValidSuggestionImageSrc(dataUrl)) {
    return { error: "too_large" };
  }
  const dims = readRasterDimensions(bytes, "image/png");
  return {
    dataUrl,
    widthPx: CHART_DISPLAY_WIDTH_PX,
    heightPx: Math.round(
      (CHART_DISPLAY_WIDTH_PX * CHART_LOGICAL_HEIGHT) / CHART_LOGICAL_WIDTH
    ),
    rasterWidthPx: dims?.width ?? CHART_LOGICAL_WIDTH * scale,
    rasterHeightPx: dims?.height ?? CHART_LOGICAL_HEIGHT * scale,
  };
}

export async function renderChartPng(
  spec: ChartSpec,
  options: RenderChartOptions = {}
): Promise<RenderedChart | RenderChartError> {
  const load = options.loadCanvas ?? defaultLoadCanvas;
  const canvasMod = load();
  if (!canvasMod) return { error: "canvas_unavailable" };
  const colors = chartBrandColors(options.packId ?? resolveCustomerId());
  const at2x = await renderAtScale(spec, 2, canvasMod, colors);
  if (!("error" in at2x)) return at2x;
  if (at2x.error === "canvas_unavailable") return at2x;
  return renderAtScale(spec, 1, canvasMod, colors);
}
