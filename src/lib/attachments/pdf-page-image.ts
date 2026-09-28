import * as napiCanvas from "@napi-rs/canvas";
import { renderPageAsImage } from "unpdf";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Enough pixels for a short table-cell stroke to survive rasterization. */
export const NUMERIC_SIGN_OVERLAY_RENDER_SCALE = 2;

async function loadNapiCanvas(): Promise<typeof import("@napi-rs/canvas")> {
  return napiCanvas;
}

function asPngBuffer(image: ArrayBuffer | Uint8Array): Buffer {
  const png = Buffer.from(
    image instanceof ArrayBuffer ? new Uint8Array(image) : image
  );
  if (
    png.length < PNG_SIGNATURE.length ||
    !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error("PDF page raster did not produce a PNG");
  }
  return png;
}

/**
 * Rasterize one PDF page so a vision overlay can see drawn strokes the text
 * layer omitted. Gemini reading the PDF file itself uses the unsigned text
 * layer and misses those strokes.
 */
export async function renderPdfPagePng(
  pdfBuffer: Buffer,
  pageNumber = 1,
  scale = NUMERIC_SIGN_OVERLAY_RENDER_SCALE
): Promise<Buffer> {
  const image = await renderPageAsImage(new Uint8Array(pdfBuffer), pageNumber, {
    canvasImport: loadNapiCanvas,
    scale,
  });
  return asPngBuffer(image);
}
