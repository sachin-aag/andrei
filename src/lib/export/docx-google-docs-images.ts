import PizZip from "pizzip";
import { readRasterDimensions } from "@/lib/export/raster-dimensions";

const EMU_PER_PX = 9525;
const MIN_RASTER_LONG_EDGE_PX = 320;

type CanvasModule = {
  createCanvas: (width: number, height: number) => {
    getContext: (type: "2d") => {
      drawImage: (image: unknown, dx: number, dy: number, dw: number, dh: number) => void;
    } | null;
    toBuffer: (mime: string) => Buffer;
  };
  loadImage: (buffer: Buffer) => Promise<unknown>;
};

function loadCanvasModule(): CanvasModule | null {
  try {
    return require("@napi-rs/canvas") as CanvasModule;
  } catch {
    return null;
  }
}

async function upscalePngBuffer(bytes: Buffer, targetLongEdge: number): Promise<Buffer> {
  const dims = readRasterDimensions(bytes, "image/png");
  if (!dims) return bytes;

  const longEdge = Math.max(dims.width, dims.height);
  if (longEdge >= targetLongEdge) return bytes;

  const canvasMod = loadCanvasModule();
  if (!canvasMod) return bytes;

  const scale = targetLongEdge / longEdge;
  const width = Math.max(1, Math.round(dims.width * scale));
  const height = Math.max(1, Math.round(dims.height * scale));
  const image = await canvasMod.loadImage(bytes);
  const canvas = canvasMod.createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return bytes;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toBuffer("image/png");
}

function stripUseLocalDpiFromXml(xml: string): string {
  return xml
    .replace(/<a14:useLocalDpi\b[^>]*\/>/g, "")
    .replace(/<a:extLst>\s*<a:ext[^>]*>\s*<\/a:ext>\s*<\/a:extLst>/g, "");
}

/**
 * Fix extent height to match embedded raster aspect ratio (Google Docs stretches otherwise).
 */
function syncDrawingExtents(xml: string, mediaDims: Map<string, { width: number; height: number }>): string {
  return xml.replace(
    /<wp:extent cx="(\d+)" cy="(\d+)"\/>[\s\S]*?<a:blip r:embed="([^"]+)"/g,
    (match, cxRaw, cyRaw, relId) => {
      const dims = mediaDims.get(relId);
      if (!dims) return match;
      const cx = Number(cxRaw);
      if (!Number.isFinite(cx) || cx <= 0) return match;
      const cy = Math.max(1, Math.round((cx * dims.height) / dims.width));
      if (cy === Number(cyRaw)) return match;
      return match.replace(`cy="${cyRaw}"`, `cy="${cy}"`);
    }
  );
}

function collectMediaDimensions(zip: PizZip): Map<string, { width: number; height: number }> {
  const relsByTarget = new Map<string, string>();
  for (const path of Object.keys(zip.files)) {
    if (!path.startsWith("word/_rels/") || !path.endsWith(".xml.rels")) continue;
    const relsXml = zip.file(path)?.asText();
    if (!relsXml) continue;
    for (const m of relsXml.matchAll(
      /<Relationship Id="([^"]+)"[^>]*Target="media\/([^"]+)"/g
    )) {
      relsByTarget.set(m[1]!, m[2]!);
    }
  }

  const byRelId = new Map<string, { width: number; height: number }>();
  for (const [relId, fileName] of relsByTarget) {
    const bytes = zip.file(`word/media/${fileName}`)?.asNodeBuffer();
    if (!bytes) continue;
    const mime = fileName.endsWith(".jpeg") || fileName.endsWith(".jpg")
      ? "image/jpeg"
      : "image/png";
    const dims = readRasterDimensions(bytes, mime);
    if (dims) byRelId.set(relId, dims);
  }
  return byRelId;
}

/**
 * Improve image sharpness/compatibility when a DOCX is opened in Google Docs.
 * - Upscale small PNGs in word/media (keeps layout extents; adds pixels for viewers that upscale).
 * - Remove useLocalDpi val="0" (Google mishandles it).
 * - Correct drawing aspect ratios from raster dimensions.
 */
export async function applyGoogleDocsImageCompat(zip: PizZip): Promise<void> {
  const pngPaths = Object.keys(zip.files).filter(
    (name) => name.startsWith("word/media/") && name.endsWith(".png")
  );

  for (const path of pngPaths) {
    const file = zip.file(path);
    if (!file) continue;
    const original = file.asNodeBuffer();
    const upscaled = await upscalePngBuffer(original, MIN_RASTER_LONG_EDGE_PX);
    if (upscaled.length !== original.length) {
      zip.file(path, upscaled);
    }
  }

  const mediaDims = collectMediaDimensions(zip);
  const xmlPaths = Object.keys(zip.files).filter(
    (name) =>
      /^word\/(document|header\d+|footer\d+)\.xml$/.test(name) &&
      !zip.files[name]?.dir
  );

  for (const path of xmlPaths) {
    const file = zip.file(path);
    if (!file) continue;
    let xml = file.asText();
    const next = syncDrawingExtents(stripUseLocalDpiFromXml(xml), mediaDims);
    if (next !== xml) zip.file(path, next);
  }
}
