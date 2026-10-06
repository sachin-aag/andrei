/**
 * Server-side resize/JPEG for vault figures copied into a suggestion.
 * Browser uploads use compress-image.ts (DOM canvas); this path uses
 * @napi-rs/canvas the same way PDF page raster does.
 */

const MAX_WIDTH_PX = 1280;
const MAX_BYTES = 1_048_576;
const JPEG_QUALITY = 80;

type NapiImage = {
  width: number;
  height: number;
};

type NapiCanvas = {
  width: number;
  height: number;
  getContext: (type: "2d") => {
    drawImage: (
      image: NapiImage,
      dx: number,
      dy: number,
      dw: number,
      dh: number
    ) => void;
  } | null;
  encode: (format: "png" | "jpeg", quality?: number) => Promise<Buffer>;
};

type NapiCanvasModule = {
  createCanvas: (width: number, height: number) => NapiCanvas;
  loadImage: (source: Buffer) => Promise<NapiImage>;
};

function loadNapiCanvas(): NapiCanvasModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@napi-rs/canvas") as NapiCanvasModule;
  } catch (error) {
    throw new Error(
      `Document figure compress cannot load @napi-rs/canvas: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function dataUrlFrom(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

export type CompressedRaster = {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
};

/**
 * Resize and JPEG-compress a PNG/JPEG/WebP/GIF buffer so it fits a
 * suggestion data-URL (same ~1MB ceiling as editor-inserted figures).
 */
export async function compressRasterToDataUrl(
  bytes: Buffer,
  options: { maxWidthPx?: number; maxBytes?: number } = {}
): Promise<CompressedRaster | null> {
  if (bytes.length === 0) return null;
  const maxWidthPx = options.maxWidthPx ?? MAX_WIDTH_PX;
  const maxBytes = options.maxBytes ?? MAX_BYTES;

  let mod: NapiCanvasModule;
  try {
    mod = loadNapiCanvas();
  } catch {
    return null;
  }

  let image: NapiImage;
  try {
    image = await mod.loadImage(bytes);
  } catch {
    return null;
  }

  const scale = Math.min(1, maxWidthPx / Math.max(image.width, 1));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = mod.createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, width, height);

  const keepPng = bytes.length < maxBytes / 2 && scale === 1;
  if (keepPng) {
    try {
      const png = await canvas.encode("png");
      if (png.length <= maxBytes) {
        return {
          dataUrl: dataUrlFrom(png, "image/png"),
          width,
          height,
          mimeType: "image/png",
        };
      }
    } catch {
      // Fall through to JPEG.
    }
  }

  let quality = JPEG_QUALITY;
  let jpeg = await canvas.encode("jpeg", quality);
  if (jpeg.length > maxBytes) {
    quality = 70;
    jpeg = await canvas.encode("jpeg", quality);
  }
  if (jpeg.length > maxBytes) {
    const shrink = Math.sqrt(maxBytes / jpeg.length);
    const nextWidth = Math.max(1, Math.round(width * shrink));
    const nextHeight = Math.max(1, Math.round(height * shrink));
    const smaller = mod.createCanvas(nextWidth, nextHeight);
    const smallerCtx = smaller.getContext("2d");
    if (!smallerCtx) return null;
    smallerCtx.drawImage(image, 0, 0, nextWidth, nextHeight);
    jpeg = await smaller.encode("jpeg", 70);
    if (jpeg.length > maxBytes) return null;
    return {
      dataUrl: dataUrlFrom(jpeg, "image/jpeg"),
      width: nextWidth,
      height: nextHeight,
      mimeType: "image/jpeg",
    };
  }

  return {
    dataUrl: dataUrlFrom(jpeg, "image/jpeg"),
    width,
    height,
    mimeType: "image/jpeg",
  };
}
