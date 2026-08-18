import { degrees, PDFDocument } from "pdf-lib";

export const DEFAULT_PDF_BATCH_PAGES = 3;
export const MAX_PDF_BATCH_PAGES = 5;
export const DEFAULT_MAX_BATCH_BYTES = 18 * 1024 * 1024;

export type PdfBatch = {
  batchIndex: number;
  pageStart: number;
  pageEnd: number;
  buffer: Buffer;
};

export type SplitPdfResult = {
  pageCount: number;
  batches: PdfBatch[];
};

export async function splitPdfIntoBatches(
  sourceBuffer: Buffer,
  options: {
    preferredPagesPerBatch?: number;
    maxPagesPerBatch?: number;
    maxBatchBytes?: number;
  } = {}
): Promise<SplitPdfResult> {
  const source = await PDFDocument.load(sourceBuffer);
  const pageCount = source.getPageCount();
  const preferredPagesPerBatch = clampInteger(
    options.preferredPagesPerBatch ?? DEFAULT_PDF_BATCH_PAGES,
    1,
    options.maxPagesPerBatch ?? MAX_PDF_BATCH_PAGES
  );
  const maxPagesPerBatch = clampInteger(
    options.maxPagesPerBatch ?? MAX_PDF_BATCH_PAGES,
    1,
    MAX_PDF_BATCH_PAGES
  );
  const maxBatchBytes = options.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES;

  const batches: PdfBatch[] = [];
  let nextPageIndex = 0;
  let batchIndex = 0;
  while (nextPageIndex < pageCount) {
    let pagesInBatch = Math.min(
      preferredPagesPerBatch,
      maxPagesPerBatch,
      pageCount - nextPageIndex
    );
    let batchBuffer = await copyPageRange(source, nextPageIndex, pagesInBatch);

    while (pagesInBatch > 1 && batchBuffer.byteLength > maxBatchBytes) {
      pagesInBatch -= 1;
      batchBuffer = await copyPageRange(source, nextPageIndex, pagesInBatch);
    }

    batches.push({
      batchIndex,
      pageStart: nextPageIndex + 1,
      pageEnd: nextPageIndex + pagesInBatch,
      buffer: batchBuffer,
    });
    nextPageIndex += pagesInBatch;
    batchIndex += 1;
  }

  return { pageCount, batches };
}

/** 1-based page number → a single-page PDF. */
export async function copyPdfPage(
  sourceBuffer: Buffer,
  pageNumber: number
): Promise<Buffer> {
  const source = await PDFDocument.load(sourceBuffer);
  const pageCount = source.getPageCount();
  if (pageNumber < 1 || pageNumber > pageCount) {
    throw new Error(
      `Page ${pageNumber} is out of range for a ${pageCount}-page PDF`
    );
  }
  return copyPageRange(source, pageNumber - 1, 1);
}

export type UprightRotateResult = {
  buffer: Buffer;
  rotated: boolean;
};

/**
 * Emit a 1-page PDF whose text reads left-to-right.
 *
 * Chrome/PDFium print-to-PDF often stores portrait pixels on a landscape
 * MediaBox, so Gemini sees the sheet sideways. Landscape pages are rotated
 * 90° counter-clockwise onto a portrait canvas. Portrait pages that already
 * carry /Rotate 90 or 270 are baked so the file itself is upright.
 */
export async function uprightRotatePage(
  sourceBuffer: Buffer
): Promise<UprightRotateResult> {
  const source = await PDFDocument.load(sourceBuffer);
  if (source.getPageCount() !== 1) {
    return { buffer: sourceBuffer, rotated: false };
  }

  const page = source.getPage(0);
  const { width, height } = page.getSize();
  const angle = normalizeDegrees(page.getRotation().angle);
  const landscape = width > height;
  const sideways = angle === 90 || angle === 270;
  if (!landscape && !sideways) {
    return { buffer: sourceBuffer, rotated: false };
  }

  try {
    const dest = await PDFDocument.create();
    const [embedded] = await dest.embedPages([page]);
    if (landscape) {
      const newPage = dest.addPage([height, width]);
      newPage.drawPage(embedded, {
        x: 0,
        y: width,
        width,
        height,
        rotate: degrees(-90),
      });
    } else if (angle === 90) {
      const newPage = dest.addPage([height, width]);
      newPage.drawPage(embedded, {
        x: height,
        y: 0,
        width,
        height,
        rotate: degrees(90),
      });
    } else {
      const newPage = dest.addPage([height, width]);
      newPage.drawPage(embedded, {
        x: 0,
        y: width,
        width,
        height,
        rotate: degrees(-90),
      });
    }
    return { buffer: Buffer.from(await dest.save()), rotated: true };
  } catch {
    // Blank pages have no Contents stream, so they cannot be re-embedded.
    // /Rotate is still enough for a PDF renderer to display them upright.
    const dest = await PDFDocument.create();
    const [copied] = await dest.copyPages(source, [0]);
    copied.setRotation(degrees(landscape || angle === 270 ? 270 : 90));
    dest.addPage(copied);
    return { buffer: Buffer.from(await dest.save()), rotated: true };
  }
}

/**
 * Crop a 1-page PDF into horizontal strips in reading order (top first).
 * Used to recover dense pages that overflow a single vision call.
 */
export async function splitPageIntoTiles(
  sourceBuffer: Buffer,
  stripCount = 2
): Promise<Buffer[]> {
  const strips = Math.max(2, Math.floor(stripCount));
  const source = await PDFDocument.load(sourceBuffer);
  if (source.getPageCount() !== 1) {
    throw new Error("splitPageIntoTiles expects a single-page PDF");
  }

  const page = source.getPage(0);
  const { width, height } = page.getSize();
  const stripHeight = height / strips;
  const tiles: Buffer[] = [];

  for (let index = 0; index < strips; index += 1) {
    const yBottom = height - (index + 1) * stripHeight;
    const dest = await PDFDocument.create();
    const [copied] = await dest.copyPages(source, [0]);
    copied.setMediaBox(0, yBottom, width, stripHeight);
    copied.setCropBox(0, yBottom, width, stripHeight);
    dest.addPage(copied);
    tiles.push(Buffer.from(await dest.save()));
  }

  return tiles;
}

function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

async function copyPageRange(
  source: PDFDocument,
  startPageIndex: number,
  pageCount: number
): Promise<Buffer> {
  const output = await PDFDocument.create();
  const indices = Array.from(
    { length: pageCount },
    (_value, index) => startPageIndex + index
  );
  const copiedPages = await output.copyPages(source, indices);
  for (const page of copiedPages) {
    output.addPage(page);
  }
  return Buffer.from(await output.save());
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return min;
  return Math.max(min, Math.min(max, value));
}
