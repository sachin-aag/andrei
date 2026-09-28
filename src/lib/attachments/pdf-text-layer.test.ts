import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { classifyPdfExtractLayout, readPdfTextLayer } from "./pdf-text-layer";

const SCAN_FIXTURE_PATH = path.join(
  process.cwd(),
  "docs/sample_files/DEV-QC-25-010 Copy (1).pdf"
);

async function pdfWithText(bodies: string[]): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const body of bodies) {
    const page = document.addPage([600, 800]);
    body.split("\n").forEach((line, index) => {
      page.drawText(line, { x: 40, y: 740 - index * 16, size: 11, font });
    });
  }
  return Buffer.from(await document.save());
}

function longBody(marker: string): string {
  return Array.from(
    { length: 12 },
    (_, index) => `${marker} line ${index} of requirement verification text`
  ).join("\n");
}

describe("readPdfTextLayer", () => {
  it("returns one usable entry per page for born-digital PDFs", async () => {
    const buffer = await pdfWithText([longBody("alpha"), longBody("beta")]);

    const layer = await readPdfTextLayer(buffer);

    expect(layer.usable).toBe(true);
    expect(layer.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(layer.pages[0]?.text).toContain("alpha line 0");
    expect(layer.pages[1]?.text).toContain("beta line 11");
  });

  it("numbers pages from the batch's absolute start", async () => {
    const buffer = await pdfWithText([longBody("alpha"), longBody("beta")]);

    const layer = await readPdfTextLayer(buffer, { pageStart: 7 });

    expect(layer.pages.map((page) => page.pageNumber)).toEqual([7, 8]);
  });

  it("marks a batch unusable when any page lacks a text layer", async () => {
    const buffer = await pdfWithText([longBody("alpha"), ""]);

    const layer = await readPdfTextLayer(buffer);

    expect(layer.usable).toBe(false);
    expect(layer.pages).toHaveLength(2);
  });

  it("treats a scanned PDF as unusable", async () => {
    const layer = await readPdfTextLayer(readFileSync(SCAN_FIXTURE_PATH));

    expect(layer.pages).toHaveLength(74);
    expect(layer.usable).toBe(false);
  });
});

describe("classifyPdfExtractLayout", () => {
  it("labels born-digital, scans, and mixed files", async () => {
    const text = await readPdfTextLayer(
      await pdfWithText([longBody("alpha"), longBody("beta")])
    );
    const mixed = await readPdfTextLayer(
      await pdfWithText([longBody("alpha"), ""])
    );
    const scan = await readPdfTextLayer(readFileSync(SCAN_FIXTURE_PATH));

    expect(classifyPdfExtractLayout(text)).toBe("text-layer");
    expect(classifyPdfExtractLayout(mixed)).toBe("mixed");
    expect(classifyPdfExtractLayout(scan)).toBe("scan");
  });
});
