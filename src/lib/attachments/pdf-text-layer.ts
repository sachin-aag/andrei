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
 * PDF.js often maps a subset-font minus to an empty string, a private-use
 * character, or a space-width run sitting one space left of the digits.
 * Naive concatenation drops those items, so URS-3 lands as `15 °C`.
 */
export function attachSpatialMinusSigns(
  items: readonly StructuredTextItem[]
): StructuredTextItem[] {
  const next = items.map((item) => ({ ...item }));
  const consumed = new Set<number>();

  for (let i = 0; i < next.length; i++) {
    const numberItem = next[i]!;
    if (!/^\d/.test(numberItem.str.trim())) continue;
    const leftIndex = nearestSignCandidateLeft(next, i, consumed);
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

function itemEm(item: StructuredTextItem): number {
  return item.fontSize > 0 ? item.fontSize : item.height > 0 ? item.height : 8;
}

function isWhitespaceItem(item: StructuredTextItem): boolean {
  return item.str.length > 0 && /^\s*$/.test(item.str);
}

function isMinusGlyphItem(item: StructuredTextItem): boolean {
  return MINUS_GLYPH_RE.test(item.str.trim());
}

function isUnmappedDashItem(item: StructuredTextItem): boolean {
  const trimmed = item.str.trim();
  return trimmed.length === 0 || UNMAPPED_DASH_RE.test(item.str);
}

/**
 * Closest item to the left of `anchorIndex` that could be a leading minus.
 * A word-space after `mm` is skipped. A dash-width space sitting alone in
 * the cell (one space left of the digits) is kept. A space *between* a
 * minus glyph and the number is skipped so the glyph is the candidate.
 */
function nearestSignCandidateLeft(
  items: readonly StructuredTextItem[],
  anchorIndex: number,
  consumed: ReadonlySet<number>
): number | null {
  const anchor = items[anchorIndex]!;
  const size = itemEm(anchor);
  const maxGap = size * 2.5;
  const baselineTol = size * 0.35;
  let best: { index: number; gap: number } | null = null;
  for (let j = 0; j < items.length; j++) {
    if (j === anchorIndex || consumed.has(j)) continue;
    const left = items[j]!;
    if (Math.abs(left.y - anchor.y) > baselineTol) continue;
    if (shouldSkipLeftItem(items, j, consumed)) continue;
    const gap = anchor.x - (left.x + Math.max(left.width, 0));
    if (gap < -size * 0.2) continue;
    if (gap > maxGap) continue;
    if (!best || gap < best.gap) best = { index: j, gap };
  }
  return best?.index ?? null;
}

function shouldSkipLeftItem(
  items: readonly StructuredTextItem[],
  leftIndex: number,
  consumed: ReadonlySet<number>
): boolean {
  const left = items[leftIndex]!;
  if (!isWhitespaceItem(left)) return false;
  const prevIndex = nearestContentLeft(items, leftIndex, consumed);
  if (prevIndex == null) return false;
  const prev = items[prevIndex]!;
  if (isMinusGlyphItem(prev) || isUnmappedDashItem(prev)) return true;
  return isWordAdjacentSpace(prev, left);
}

function nearestContentLeft(
  items: readonly StructuredTextItem[],
  fromIndex: number,
  consumed: ReadonlySet<number>
): number | null {
  const from = items[fromIndex]!;
  const size = itemEm(from);
  const maxGap = size * 2.5;
  const baselineTol = size * 0.35;
  let best: { index: number; gap: number } | null = null;
  for (let j = 0; j < items.length; j++) {
    if (j === fromIndex || consumed.has(j)) continue;
    const left = items[j]!;
    if (isWhitespaceItem(left)) continue;
    if (Math.abs(left.y - from.y) > baselineTol) continue;
    const gap = from.x - (left.x + Math.max(left.width, 0));
    if (gap < -size * 0.2) continue;
    if (gap > maxGap) continue;
    if (!best || gap < best.gap) best = { index: j, gap };
  }
  return best?.index ?? null;
}

function isWordAdjacentSpace(
  prev: StructuredTextItem,
  space: StructuredTextItem
): boolean {
  if (!/[A-Za-z0-9]$/.test(prev.str.trim())) return false;
  const gap = space.x - (prev.x + Math.max(prev.width, 0));
  return gap <= itemEm(space) * 0.5;
}

function isPrecededByDigit(
  items: readonly StructuredTextItem[],
  dashIndex: number,
  consumed: ReadonlySet<number>
): boolean {
  const leftIndex = nearestSignCandidateLeft(items, dashIndex, consumed);
  if (leftIndex == null) return false;
  return /\d$/.test(items[leftIndex]!.str.trim());
}

function isSpatialMinus(item: StructuredTextItem, gap: number): boolean {
  const trimmed = item.str.trim();
  if (MINUS_GLYPH_RE.test(trimmed)) return true;
  if (trimmed.length > 1) return false;
  if (!isUnmappedDashItem(item) && !isWhitespaceItem(item)) return false;
  const size = itemEm(item);
  if (item.width > 0) {
    const ratio = item.width / size;
    return ratio >= 0.15 && ratio <= 0.8;
  }
  // PDF.js maps some subset-font minuses to an empty .notdef with width 0.
  // A coincident item (gap ~ 0) or one space away still counts.
  return gap >= -size * 0.2 && gap <= size * 2.5;
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
