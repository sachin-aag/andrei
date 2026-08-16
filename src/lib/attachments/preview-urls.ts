import { kindFromMime } from "@/lib/attachments/file-types";

/**
 * Iframe `src` for an uploaded attachment.
 *
 * PDFs are streamed same-origin (`proxy=1`) so the frame never follows a
 * redirect to GCS. Comet and other browsers block `storage.googleapis.com`
 * inside iframes, and preview-deployment origins are not on the bucket CORS
 * list. `#page=` is what Chrome's native viewer uses to open a given page.
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
  return `${base}/content?proxy=1&page=${pageNumber}#page=${pageNumber}`;
}

/** Direct download still uses a signed URL (not the iframe proxy). */
export function attachmentDownloadHref(
  reportId: string,
  attachmentId: string
): string {
  return `/api/reports/${reportId}/attachments/${attachmentId}/content?download=1`;
}
