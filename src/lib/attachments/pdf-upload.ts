export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export const PDF_MIME_TYPE = "application/pdf";

function hasPdfExtension(filename: string): boolean {
  return filename.toLowerCase().endsWith(".pdf");
}

function isPdfMimeType(mimeType: string): boolean {
  return mimeType.trim().toLowerCase() === PDF_MIME_TYPE;
}

export function pdfUploadError(file: File): string | null {
  if (file.size > MAX_PDF_BYTES) {
    return "PDF is too large (max 25 MB)";
  }
  if (!hasPdfExtension(file.name) || !isPdfMimeType(file.type)) {
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
  if (!hasPdfExtension(args.filename) || !isPdfMimeType(args.mimeType)) {
    return "Only PDF files are supported";
  }
  return null;
}
