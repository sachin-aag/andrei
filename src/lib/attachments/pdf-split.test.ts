import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  copyPdfPage,
  splitPageIntoTiles,
  splitPdfIntoBatches,
  uprightRotatePage,
} from "./pdf-split";

async function pdfWithPages(pageCount: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    document.addPage();
  }
  return Buffer.from(await document.save());
}

describe("splitPdfIntoBatches", () => {
  it("splits PDFs into consecutive preferred three-page batches", async () => {
    const result = await splitPdfIntoBatches(await pdfWithPages(7));

    expect(result.pageCount).toBe(7);
    expect(
      result.batches.map((batch) => ({
        pageStart: batch.pageStart,
        pageEnd: batch.pageEnd,
      }))
    ).toEqual([
      { pageStart: 1, pageEnd: 3 },
      { pageStart: 4, pageEnd: 6 },
      { pageStart: 7, pageEnd: 7 },
    ]);
  });

  it("reduces batch size when a generated slice is too large", async () => {
    const result = await splitPdfIntoBatches(await pdfWithPages(3), {
      maxBatchBytes: 1,
    });

    expect(result.batches).toHaveLength(3);
    expect(result.batches.map((batch) => batch.pageStart)).toEqual([1, 2, 3]);
    expect(result.batches.map((batch) => batch.pageEnd)).toEqual([1, 2, 3]);
  });
});

describe("copyPdfPage", () => {
  it("returns a single-page PDF for the requested page", async () => {
    const copied = await copyPdfPage(await pdfWithPages(3), 2);
    const document = await PDFDocument.load(copied);
    expect(document.getPageCount()).toBe(1);
  });
});

describe("uprightRotatePage", () => {
  it("leaves an already-portrait page unchanged", async () => {
    const source = await pdfWithPages(1);
    const result = await uprightRotatePage(source);
    expect(result.rotated).toBe(false);
    expect(result.buffer.equals(source)).toBe(true);
  });

  it("rotates a landscape page onto a portrait canvas", async () => {
    const document = await PDFDocument.create();
    const page = document.addPage([792, 612]);
    page.drawRectangle({ x: 40, y: 40, width: 80, height: 200 });
    const source = Buffer.from(await document.save());

    const result = await uprightRotatePage(source);
    expect(result.rotated).toBe(true);

    const upright = await PDFDocument.load(result.buffer);
    expect(upright.getPageCount()).toBe(1);
    const { width, height } = upright.getPage(0).getSize();
    expect(height).toBeGreaterThan(width);
  });
});

describe("splitPageIntoTiles", () => {
  it("crops a page into two 1-page strips in reading order", async () => {
    const document = await PDFDocument.create();
    document.addPage([600, 800]);
    const source = Buffer.from(await document.save());

    const tiles = await splitPageIntoTiles(source, 2);
    expect(tiles).toHaveLength(2);

    const sizes = await Promise.all(
      tiles.map(async (tile) => {
        const page = (await PDFDocument.load(tile)).getPage(0);
        return page.getSize();
      })
    );
    expect(sizes[0]).toEqual({ width: 600, height: 400 });
    expect(sizes[1]).toEqual({ width: 600, height: 400 });
  });
});
