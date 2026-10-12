// Standalone constants (no `@/db/schema` import) so this module stays safe to
// bundle into client components without pulling the Drizzle schema along.
export const PDF_MIME_TYPE = "application/pdf";
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const CSV_MIME_TYPE = "text/csv";
export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type AttachmentKind = "pdf" | "docx" | "csv" | "xlsx";

export const ATTACHMENT_MIME_BY_KIND: Record<AttachmentKind, string> = {
  pdf: PDF_MIME_TYPE,
  docx: DOCX_MIME_TYPE,
  csv: CSV_MIME_TYPE,
  xlsx: XLSX_MIME_TYPE,
};

const EXTENSION_KIND: Record<string, AttachmentKind> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".csv": "csv",
  ".xlsx": "xlsx",
};

const MIME_KIND: Record<string, AttachmentKind> = {
  [PDF_MIME_TYPE]: "pdf",
  [DOCX_MIME_TYPE]: "docx",
  [CSV_MIME_TYPE]: "csv",
  "application/csv": "csv",
  [XLSX_MIME_TYPE]: "xlsx",
};

/** `accept` attribute value for file inputs across the attachment UI. */
export const ATTACHMENT_ACCEPT_ATTR = [
  PDF_MIME_TYPE,
  ".pdf",
  DOCX_MIME_TYPE,
  ".docx",
  CSV_MIME_TYPE,
  ".csv",
  XLSX_MIME_TYPE,
  ".xlsx",
].join(",");

export const UNSUPPORTED_ATTACHMENT_TYPE_MESSAGE =
  "Only PDF, Word (.docx), CSV, and Excel (.xlsx) files are allowed";

function normalizeMime(mimeType: string | null | undefined): string {
  return (mimeType ?? "").toLowerCase().split(";")[0].trim();
}

function kindFromExtension(filename: string): AttachmentKind | null {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTENSION_KIND[lower.slice(dot)] ?? null;
}

/**
 * True when `filename` ends with a supported attachment extension.
 * Placeholder/citation guards should use this so new kinds only need
 * {@link EXTENSION_KIND} updates — not parallel hardcoding.
 */
export function hasSupportedAttachmentExtension(filename: string): boolean {
  return kindFromExtension(filename.trim()) !== null;
}

export function kindFromMime(
  mimeType: string | null | undefined
): AttachmentKind | null {
  return MIME_KIND[normalizeMime(mimeType)] ?? null;
}

/**
 * Resolve the attachment kind from a filename + optional MIME type.
 *
 * The extension is authoritative — browsers routinely omit or misreport the
 * type for `.docx` / `.xlsx` / `.csv` (empty, `application/octet-stream`, or
 * `application/vnd.ms-excel`). A MIME type is only used to reject an obvious
 * mismatch (e.g. a `.docx` sent as `application/pdf`).
 */
export function resolveAttachmentKind(input: {
  filename: string;
  mimeType?: string | null;
}): AttachmentKind | null {
  const byExtension = kindFromExtension(input.filename);
  if (!byExtension) return null;
  const byMime = MIME_KIND[normalizeMime(input.mimeType)];
  if (byMime && byMime !== byExtension) return null;
  return byExtension;
}

export function isSupportedAttachment(input: {
  filename: string;
  mimeType?: string | null;
}): boolean {
  return resolveAttachmentKind(input) !== null;
}

/**
 * Canonical MIME type to store/serve/PUT for a supported upload, or null when
 * the file is not a supported attachment. Using the canonical type keeps the
 * GCS resumable-session content type and the browser PUT header in agreement
 * even when the browser reported an empty or generic `File.type`.
 */
export function canonicalAttachmentMime(input: {
  filename: string;
  mimeType?: string | null;
}): string | null {
  const kind = resolveAttachmentKind(input);
  return kind ? ATTACHMENT_MIME_BY_KIND[kind] : null;
}

export function attachmentKindLabel(kind: AttachmentKind): string {
  switch (kind) {
    case "pdf":
      return "PDF document";
    case "docx":
      return "Word document";
    case "csv":
      return "CSV spreadsheet";
    case "xlsx":
      return "Excel spreadsheet";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** Word, CSV, and Excel are served as sandboxed HTML; PDFs use pdf.js. */
export function usesHtmlPreview(kind: AttachmentKind | null): boolean {
  return kind === "docx" || kind === "csv" || kind === "xlsx";
}

export function isSpreadsheetKind(kind: AttachmentKind | null): boolean {
  return kind === "csv" || kind === "xlsx";
}
