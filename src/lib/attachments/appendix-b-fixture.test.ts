import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDict, PDFDocument, PDFName, type PDFPage } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  copyPdfPage,
  splitPageIntoTiles,
  uprightRotatePage,
} from "./pdf-split";
import { MIN_TEXT_LAYER_CHARS, readPdfTextLayer } from "./pdf-text-layer";
import { validatePdf } from "./validate-pdf";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "docs/sample_files/appendix-b-790-00134r-revu.pdf"
);

describe("Appendix B 790-00134R RevU sample PDF fixture", () => {
  const buffer = readFileSync(FIXTURE_PATH);

  it("validates as a 62-page PDF", async () => {
    await expect(validatePdf(buffer, { maxPages: 500 })).resolves.toEqual({
      pageCount: 62,
    });
  });

  it("has a usable text layer only on page 1", async () => {
    const layer = await readPdfTextLayer(buffer);

    expect(layer.pages).toHaveLength(62);
    expect(layer.usable).toBe(false);

    const usable = layer.pages.filter(
      (page) => page.text.length >= MIN_TEXT_LAYER_CHARS
    );
    expect(usable.map((page) => page.pageNumber)).toEqual([1]);
    expect(layer.pages[3]?.text.length ?? 0).toBeLessThan(MIN_TEXT_LAYER_CHARS);
  });

  it("stores page 4 as a landscape image-only sheet", async () => {
    const pageFour = await copyPdfPage(buffer, 4);
    const document = await PDFDocument.load(pageFour);
    const page = document.getPage(0);
    const { width, height } = page.getSize();

    expect(width).toBeGreaterThan(height);
    expect(countEmbeddedImages(page)).toBe(1);

    const layer = await readPdfTextLayer(pageFour, { pageStart: 4 });
    expect(layer.usable).toBe(false);
    expect(layer.pages[0]?.text.length ?? 0).toBeLessThan(MIN_TEXT_LAYER_CHARS);
  });

  it("rotates page 4 upright and splits it into two 1-page tiles", async () => {
    const pageFour = await copyPdfPage(buffer, 4);
    const upright = await uprightRotatePage(pageFour);
    expect(upright.rotated).toBe(true);

    const uprightDoc = await PDFDocument.load(upright.buffer);
    const { width, height } = uprightDoc.getPage(0).getSize();
    expect(height).toBeGreaterThan(width);

    const tiles = await splitPageIntoTiles(upright.buffer, 2);
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) {
      const tileDoc = await PDFDocument.load(tile);
      expect(tileDoc.getPageCount()).toBe(1);
      expect(tile.byteLength).toBeGreaterThan(0);
    }
  });
});

function countEmbeddedImages(page: PDFPage): number {
  const resources = page.node.Resources();
  if (!resources) return 0;
  const xObject = resources.lookup(PDFName.of("XObject"));
  if (!(xObject instanceof PDFDict)) return 0;

  let count = 0;
  for (const key of xObject.keys()) {
    const maybeStream = xObject.lookup(key);
    const dict =
      maybeStream instanceof PDFDict
        ? maybeStream
        : maybeStream &&
            typeof maybeStream === "object" &&
            "dict" in maybeStream &&
            maybeStream.dict instanceof PDFDict
          ? maybeStream.dict
          : null;
    if (dict?.lookup(PDFName.of("Subtype")) === PDFName.of("Image")) {
      count += 1;
    }
  }
  return count;
}
