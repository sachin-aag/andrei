import { extractText, getDocumentProxy } from "unpdf";

/**
 * Below this many characters a page is treated as a scan: born-digital pages
 * carry their full body text, while scans expose only stray header artifacts.
 */
export const MIN_TEXT_LAYER_CHARS = 180;

export type PdfPageText = {
  pageNumber: number;
  text: string;
};

export type PdfTextLayer = {
  pages: PdfPageText[];
  /** True when every page carries enough text to skip vision transcription. */
  usable: boolean;
};

export type ReadPdfTextLayerOptions = {
  /** Absolute document page number of the first page in this buffer. */
  pageStart?: number;
  minChars?: number;
};

/**
 * Read the embedded text layer of a PDF, one entry per page.
 *
 * This is the deterministic transcription path: for born-digital PDFs it
 * replaces model transcription entirely, which keeps dense pages from
 * blowing the model's structured-output budget.
 */
export async function readPdfTextLayer(
  buffer: Buffer,
  options: ReadPdfTextLayerOptions = {}
): Promise<PdfTextLayer> {
  const pageStart = options.pageStart ?? 1;
  const minChars = options.minChars ?? MIN_TEXT_LAYER_CHARS;

  ensureMathSumPrecise();

  const document = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(document, { mergePages: false });
  const pages = text.map((raw, index) => ({
    pageNumber: pageStart + index,
    text: normalizePageText(raw),
  }));

  return {
    pages,
    usable:
      pages.length > 0 &&
      pages.every((page) => page.text.length >= minChars),
  };
}

function normalizePageText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type MathWithSumPrecise = Math & {
  sumPrecise?: (values: Iterable<number>) => number;
};

/**
 * pdf.js calls `Math.sumPrecise`, which only exists on Node 24+. Without it
 * every page logs a TypeError warning and falls back to coarser text layout.
 */
function ensureMathSumPrecise(): void {
  const target = Math as MathWithSumPrecise;
  if (typeof target.sumPrecise === "function") return;
  target.sumPrecise = (values) => {
    let total = 0;
    for (const value of values) total += value;
    return total;
  };
}
