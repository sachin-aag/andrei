import PizZip from "pizzip";

export type ValidateDocxResult = {
  /** DOCX has no fixed page model; a sentinel keeps the "stored" gate happy. */
  pageCount: number;
};

/**
 * Validate an uploaded `.docx` (OOXML) buffer. Mirrors `validate-pdf.ts`: checks
 * the ZIP magic bytes and that the archive contains the main Word document part,
 * so a renamed non-docx (or legacy binary `.doc`) is rejected before ingest.
 */
export function validateDocx(buffer: Buffer): ValidateDocxResult {
  // ZIP local file header magic: PK\x03\x04.
  if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new Error("File is not a Word .docx document");
  }

  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new Error("Word .docx could not be parsed");
  }

  if (!zip.file("word/document.xml")) {
    throw new Error("File is not a valid Word .docx document");
  }

  return { pageCount: 1 };
}
