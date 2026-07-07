export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export const PDF_MIME_TYPE = "application/pdf";

export function pdfUploadError(file: File): string | null {
  if (file.size > MAX_PDF_BYTES) {
    return "PDF is too large (max 25 MB)";
  }
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".pdf") && file.type !== PDF_MIME_TYPE) {
    return "Only PDF files are supported";
  }
  return null;
}

export function validatePdfUploadInput(args: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): string | null {
  if (args.sizeBytes > MAX_PDF_BYTES) {
    return "PDF is too large (max 25 MB)";
  }
  if (args.sizeBytes <= 0) {
    return "Empty file";
  }
  const lower = args.filename.toLowerCase();
  if (!lower.endsWith(".pdf") && args.mimeType !== PDF_MIME_TYPE) {
    return "Only PDF files are supported";
  }
  return null;
}
