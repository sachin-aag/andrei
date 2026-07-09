import { describe, expect, it } from "vitest";
import { validatePdfUploadInput, pdfUploadError, MAX_PDF_BYTES } from "./pdf-upload";

describe("pdf upload validation", () => {
  it("rejects non-pdf files", () => {
    expect(
      validatePdfUploadInput({
        filename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 100,
      })
    ).toBe("Only PDF files are supported");
  });

  it("rejects pdf filenames with non-pdf MIME types", () => {
    expect(
      validatePdfUploadInput({
        filename: "evil.pdf",
        mimeType: "text/html",
        sizeBytes: 100,
      })
    ).toBe("Only PDF files are supported");
  });

  it("rejects pdf MIME types without pdf filenames", () => {
    expect(
      validatePdfUploadInput({
        filename: "notes.txt",
        mimeType: "application/pdf",
        sizeBytes: 100,
      })
    ).toBe("Only PDF files are supported");
  });

  it("rejects oversize files", () => {
    expect(
      validatePdfUploadInput({
        filename: "big.pdf",
        mimeType: "application/pdf",
        sizeBytes: MAX_PDF_BYTES + 1,
      })
    ).toMatch(/too large/);
  });

  it("accepts valid pdf metadata", () => {
    expect(
      validatePdfUploadInput({
        filename: "spec.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      })
    ).toBeNull();
  });

  it("validates File objects in the browser helper", () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 50 });
    expect(pdfUploadError(file)).toBeNull();
  });

  it("rejects File objects with pdf filenames and non-pdf MIME types", () => {
    const file = new File(["<script></script>"], "evil.pdf", {
      type: "text/html",
    });
    Object.defineProperty(file, "size", { value: 50 });
    expect(pdfUploadError(file)).toBe("Only PDF files are supported");
  });
});
