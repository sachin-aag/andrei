import { PDFDocument } from "pdf-lib";

export type ValidatePdfOptions = {
  maxPages: number;
};

export type ValidatePdfResult = {
  pageCount: number;
};

export async function validatePdf(
  buffer: Buffer,
  { maxPages }: ValidatePdfOptions
): Promise<ValidatePdfResult> {
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("File is not a PDF");
  }

  let document: PDFDocument;
  try {
    document = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    throw new Error("PDF could not be parsed");
  }

  if (document.isEncrypted) {
    throw new Error("Encrypted PDFs are not supported");
  }

  const pageCount = document.getPageCount();
  if (pageCount <= 0) {
    throw new Error("PDF must contain at least one page");
  }
  if (pageCount > maxPages) {
    throw new Error(`PDF exceeds ${maxPages} page limit`);
  }

  return { pageCount };
}
