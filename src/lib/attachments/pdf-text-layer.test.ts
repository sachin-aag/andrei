import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { StructuredTextItem } from "unpdf";
import {
  attachSpatialMinusSigns,
  classifyPdfExtractLayout,
  readPdfTextLayer,
  reconstructPageText,
} from "./pdf-text-layer";

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

function pdfItem(
  str: string,
  x: number,
  y = 200,
  extras: Partial<StructuredTextItem> = {}
): StructuredTextItem {
  return {
    width: extras.width ?? Math.max(str.length * 6, 4),
    height: extras.height ?? 10,
    fontSize: extras.fontSize ?? 10,
    fontFamily: extras.fontFamily ?? "",
    dir: extras.dir ?? "ltr",
    hasEOL: extras.hasEOL ?? false,
    ...extras,
    str,
    x,
    y,
  };
}

describe("reconstructPageText", () => {
  it("restores a minus that PDF.js emitted as an empty-width glyph before 15", () => {
    expect(
      reconstructPageText([
        pdfItem("1 mm ", 10),
        pdfItem("", 80, 200, { width: 4, fontSize: 10 }),
        pdfItem("15 °C to 130 °C", 85),
      ])
    ).toContain("-15 °C to 130 °C");
  });

  it("glues a minus item that is spatially left of 15 even if stream order is later", () => {
    const items = [
      pdfItem("URS-3 Shell Operating temperature ", 10),
      pdfItem("15 °C to 130 °C", 220),
      pdfItem("−", 214, 200, { width: 5 }),
    ];
    expect(reconstructPageText(items)).toMatch(/-15 °C to 130 °C/);
    expect(
      attachSpatialMinusSigns(items).some((item) => item.str === "−")
    ).toBe(false);
  });

  it("does not treat a word-space before 15 as a minus", () => {
    expect(
      reconstructPageText([
        pdfItem("than 1 mm", 10, 200, { width: 50 }),
        pdfItem(" ", 62, 200, { width: 3 }),
        pdfItem("15 °C to 130 °C", 66),
      ])
    ).toBe("than 1 mm 15 °C to 130 °C");
  });

  it("keeps an en-dash range between 15 and 130", () => {
    expect(
      reconstructPageText([
        pdfItem("15", 10, 200, { width: 12 }),
        pdfItem("–", 24, 200, { width: 4 }),
        pdfItem("130 °C", 30, 200, { width: 40 }),
      ])
    ).toBe("15–130 °C");
  });
});

describe("readPdfTextLayer signed temperatures", () => {
  it("keeps a minus drawn as its own glyph before 15 °C", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage([600, 800]);
    page.drawText("Shell Operating temperature", {
      x: 40,
      y: 700,
      size: 11,
      font,
    });
    page.drawText("-", { x: 40, y: 680, size: 11, font });
    page.drawText("15 C to 130 C", { x: 46, y: 680, size: 11, font });
    const layer = await readPdfTextLayer(
      Buffer.from(await document.save())
    );
    expect(layer.pages[0]?.text).toMatch(/-15 C to 130 C/);
  });
});
