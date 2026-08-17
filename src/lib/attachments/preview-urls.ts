import { kindFromMime } from "@/lib/attachments/file-types";

/**
 * Preview URL for an uploaded attachment.
 *
 * PDFs are fetched same-origin (`proxy=1`) and painted as an image — never
 * navigated as `application/pdf` in an iframe. Comet intercepts iframe PDF
 * loads (including our own origin) and shows a block page. DOCX is still
 * server-rendered HTML in a sandboxed iframe.
 */
export function attachmentPreviewSrc(input: {
  reportId: string;
  attachmentId: string;
  mimeType: string;
  page: number;
}): string {
  const { reportId, attachmentId, mimeType, page } = input;
  const base = `/api/reports/${reportId}/attachments/${attachmentId}`;
  if (kindFromMime(mimeType) === "docx") {
    return `${base}/preview`;
  }
  const pageNumber = Number.isInteger(page) && page > 0 ? page : 1;
  return `${base}/content?proxy=1&page=${pageNumber}`;
}

/** Direct download still uses a signed URL (not the iframe proxy). */
export function attachmentDownloadHref(
  reportId: string,
  attachmentId: string
): string {
  return `/api/reports/${reportId}/attachments/${attachmentId}/content?download=1`;
}
