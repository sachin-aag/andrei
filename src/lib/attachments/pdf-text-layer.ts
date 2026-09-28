import {
  extractTextItems,
  getDocumentProxy,
  type StructuredTextItem,
} from "unpdf";
import {
  glueOcrMinusSigns,
  LEADING_MINUS_CLASS,
} from "@/lib/attachments/numeric-signs";

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

export type PdfExtractLayout = "text-layer" | "scan" | "mixed";

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
  const { items } = await extractTextItems(document);
  const pages = items.map((pageItems, index) => ({
    pageNumber: pageStart + index,
    text: reconstructPageText(pageItems),
  }));

  return {
    pages,
    usable:
      pages.length > 0 &&
      pages.every((page) => page.text.length >= minChars),
  };
}

export function classifyPdfExtractLayout(
  layer: PdfTextLayer,
  minChars = MIN_TEXT_LAYER_CHARS
): PdfExtractLayout {
  if (layer.pages.length === 0) return "scan";
  const usableCount = layer.pages.filter(
    (page) => page.text.length >= minChars
  ).length;
  if (usableCount === 0) return "scan";
  if (usableCount === layer.pages.length) return "text-layer";
  return "mixed";
}

const MINUS_GLYPH_RE = new RegExp(`^${LEADING_MINUS_CLASS}$`);
const UNMAPPED_DASH_RE = /^[\u0000\uFFFD\uE000-\uF8FF]$/;

/**
 * PDF.js often maps a subset-font minus to an empty string (or a private-use
 * / replacement character) while keeping the glyph's width. Those items are
 * dropped by naive concatenation, so URS-3 lands as `15 °C` instead of `-15`.
 */
export function attachSpatialMinusSigns(
  items: readonly StructuredTextItem[]
): StructuredTextItem[] {
  const next = items.map((item) => ({ ...item }));
  const consumed = new Set<number>();

  for (let i = 0; i < next.length; i++) {
    const numberItem = next[i]!;
    if (!/^\d/.test(numberItem.str.trim())) continue;
    const leftIndex = nearestNonWhitespaceLeft(next, i, consumed);
    if (leftIndex == null) continue;
    const left = next[leftIndex]!;
    if (/\d$/.test(left.str.trim())) continue;
    const gap = numberItem.x - (left.x + Math.max(left.width, 0));
    if (!isSpatialMinus(left, gap)) continue;
    if (isPrecededByDigit(next, leftIndex, consumed)) continue;
    numberItem.str = `-${numberItem.str.replace(/^\s+/, "")}`;
    consumed.add(leftIndex);
  }

  return next.filter((_, index) => !consumed.has(index));
}

export function reconstructPageText(
  items: readonly StructuredTextItem[]
): string {
  return normalizePageText(
    attachSpatialMinusSigns(items)
      .map((item) => item.str + (item.hasEOL ? "\n" : ""))
      .join("")
  );
}

function nearestNonWhitespaceLeft(
  items: readonly StructuredTextItem[],
  numberIndex: number,
  consumed: ReadonlySet<number>
): number | null {
  const numberItem = items[numberIndex]!;
  const maxGap = Math.max(numberItem.fontSize, 8) * 1.25;
  const baselineTol = Math.max(numberItem.fontSize, 8) * 0.35;
  let best: { index: number; gap: number } | null = null;
  for (let j = 0; j < items.length; j++) {
    if (j === numberIndex || consumed.has(j)) continue;
    const left = items[j]!;
    if (left.str.length > 0 && /^\s*$/.test(left.str)) continue;
    if (Math.abs(left.y - numberItem.y) > baselineTol) continue;
    const gap = numberItem.x - (left.x + Math.max(left.width, 0));
    if (gap < -Math.max(numberItem.fontSize, 8) * 0.2) continue;
    if (gap > maxGap) continue;
    if (!best || gap < best.gap) best = { index: j, gap };
  }
  return best?.index ?? null;
}

function isPrecededByDigit(
  items: readonly StructuredTextItem[],
  dashIndex: number,
  consumed: ReadonlySet<number>
): boolean {
  const leftIndex = nearestNonWhitespaceLeft(items, dashIndex, consumed);
  if (leftIndex == null) return false;
  return /\d$/.test(items[leftIndex]!.str.trim());
}

function isSpatialMinus(item: StructuredTextItem, gap: number): boolean {
  const trimmed = item.str.trim();
  if (MINUS_GLYPH_RE.test(trimmed)) return true;
  if (trimmed.length > 1) return false;
  const unmapped =
    trimmed.length === 0 || UNMAPPED_DASH_RE.test(item.str);
  if (!unmapped) return false;
  const em =
    item.fontSize > 0 ? item.fontSize : item.height > 0 ? item.height : 8;
  if (item.width > 0) {
    const ratio = item.width / em;
    return ratio >= 0.15 && ratio <= 0.8;
  }
  // PDF.js maps some subset-font minuses to an empty .notdef with width 0.
  // Keep a small gap so a coincident empty item is not treated as a sign.
  return gap >= em * 0.05 && gap <= em * 1.25;
}

function normalizePageText(raw: string): string {
  return glueOcrMinusSigns(
    raw
      .replace(/\r\n/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
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
