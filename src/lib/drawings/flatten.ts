import {
  drawingExtent,
  flattenPixelPad,
  isEmptyImageDrawing,
  parseImageDrawing,
  type ImageDrawing,
} from "@/lib/drawings/overlay";
import { paintDrawing, type DrawingPaintContext } from "@/lib/drawings/paint";

type NapiImage = {
  width: number;
  height: number;
};

type NapiCanvas = {
  width: number;
  height: number;
  getContext: (type: "2d") => (DrawingPaintContext & {
    drawImage: (
      image: NapiImage,
      dx: number,
      dy: number,
      dw: number,
      dh: number
    ) => void;
  }) | null;
  encode: (format: "png" | "jpeg", quality?: number) => Promise<Buffer>;
};

type NapiCanvasModule = {
  createCanvas: (width: number, height: number) => NapiCanvas;
  loadImage: (source: Buffer) => Promise<NapiImage>;
};

function loadNapiCanvas(): NapiCanvasModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@napi-rs/canvas") as NapiCanvasModule;
  } catch {
    return null;
  }
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return {
      mimeType: match[1]!.toLowerCase(),
      bytes: Buffer.from(match[2]!, "base64"),
    };
  } catch {
    return null;
  }
}

/**
 * Composite overlay shapes onto the source raster for Google Docs and the
 * Word AlternateContent Fallback. Returns the original data URL when there
 * is nothing to paint or the canvas library cannot load.
 */
export async function flattenDrawingDataUrl(
  dataUrl: string,
  drawing: ImageDrawing | null | undefined
): Promise<string> {
  if (!dataUrl || isEmptyImageDrawing(drawing)) return dataUrl;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;
  const mod = loadNapiCanvas();
  if (!mod) {
    console.error("[drawing] flatten skipped: @napi-rs/canvas unavailable");
    return dataUrl;
  }
  let image: NapiImage;
  try {
    image = await mod.loadImage(parsed.bytes);
  } catch (error) {
    console.error("[drawing] flatten could not load source image", error);
    return dataUrl;
  }
  const width = Math.max(1, image.width);
  const height = Math.max(1, image.height);
  const pad = flattenPixelPad(drawingExtent(drawing), width, height);
  const canvasWidth = Math.max(1, width + pad.left + pad.right);
  const canvasHeight = Math.max(1, height + pad.top + pad.bottom);
  const canvas = mod.createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(image, pad.left, pad.top, width, height);
  paintDrawing(ctx, drawing!, width, height, { x: pad.left, y: pad.top });
  try {
    const png = await canvas.encode("png");
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.error("[drawing] flatten encode failed", error);
    return dataUrl;
  }
}

/**
 * Walk section JSON (or a TipTap doc) and bake overlays into a raster for
 * Google Docs / older Word (AlternateContent Fallback). Keep the original
 * src + drawing so Microsoft Word can emit native editable arrows/labels.
 * Empty overlays are left as-is.
 */
export async function flattenDrawingsInValue(value: unknown): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => flattenDrawingsInValue(item)));
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.type === "imageInline") {
    const attrs =
      record.attrs && typeof record.attrs === "object" && !Array.isArray(record.attrs)
        ? (record.attrs as Record<string, unknown>)
        : {};
    const src = typeof attrs.src === "string" ? attrs.src : "";
    const drawing = parseImageDrawing(attrs.drawing);
    if (src && !isEmptyImageDrawing(drawing)) {
      return {
        ...record,
        attrs: {
          ...attrs,
          src,
          drawing,
          flattenedSrc: await flattenDrawingDataUrl(src, drawing),
        },
      };
    }
  }
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    next[key] = await flattenDrawingsInValue(child);
  }
  return next;
}
