import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { validatePdf } from "./validate-pdf";

async function minimalPdfBuffer(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage();
  return Buffer.from(await document.save());
}

describe("validatePdf", () => {
  it("returns the page count for a parseable PDF", async () => {
    await expect(
      validatePdf(await minimalPdfBuffer(), { maxPages: 500 })
    ).resolves.toEqual({ pageCount: 1 });
  });

  it("rejects non-PDF bytes", async () => {
    await expect(
      validatePdf(Buffer.from("not a pdf"), { maxPages: 500 })
    ).rejects.toThrow("File is not a PDF");
  });

  it("rejects PDFs over the page limit", async () => {
    await expect(
      validatePdf(await minimalPdfBuffer(), { maxPages: 0 })
    ).rejects.toThrow("PDF exceeds 0 page limit");
  });
});
