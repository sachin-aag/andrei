import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderPdfPagePng } from "./pdf-page-image";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

async function pdfWithUnsignedCelsiusRange(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([600, 800]);
  page.drawText("15 °C to 130 °C", { x: 54, y: 560, size: 11, font });
  return Buffer.from(await document.save());
}

async function pdfWithStrokedMinusCelsiusRange(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([600, 800]);
  page.drawLine({
    start: { x: 40, y: 564 },
    end: { x: 50, y: 564 },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });
  page.drawText("15 °C to 130 °C", { x: 54, y: 560, size: 11, font });
  return Buffer.from(await document.save());
}

describe("renderPdfPagePng", () => {
  it("rasters a drawn minus stroke that the text layer cannot carry", async () => {
    const unsigned = await renderPdfPagePng(await pdfWithUnsignedCelsiusRange());
    const stroked = await renderPdfPagePng(
      await pdfWithStrokedMinusCelsiusRange()
    );

    expect(unsigned.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
    expect(stroked.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
    expect(stroked.equals(unsigned)).toBe(false);
  });
});
