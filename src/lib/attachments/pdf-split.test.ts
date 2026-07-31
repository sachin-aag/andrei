import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { splitPdfIntoBatches } from "./pdf-split";

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
