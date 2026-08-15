import { PDFDocument } from "pdf-lib";

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
