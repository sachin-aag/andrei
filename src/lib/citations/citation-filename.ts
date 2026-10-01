/**
 * QMS / browser download stamp glued to a filename stem:
 * `_YYYYMMDDHHmmss` immediately before the extension
 * (`PQR-24-PR-102_20250320092518.pdf` → `PQR-24-PR-102.pdf`).
 * Underscored titles (`790-00134R_Rev_U_Solea.docx`) are unchanged.
 */
const DOWNLOAD_STAMP_AT_END = /_(?:19|20)\d{12}$/;

/**
 * Filename shown in `[filename, p. N]` citations. Strips a trailing
 * download timestamp so parked sources match the document number the
 * engineer knows, not the unique export name.
 */
export function citationDisplayFilename(filename: string): string {
  const name = filename.trim();
  if (!name) return name;
  const dot = name.lastIndexOf(".");
  if (extLooksLikeFileType(name, dot)) {
    const stem = name.slice(0, dot);
    const extension = name.slice(dot);
    return `${stem.replace(DOWNLOAD_STAMP_AT_END, "")}${extension}`;
  }
  return name.replace(DOWNLOAD_STAMP_AT_END, "");
}

function extLooksLikeFileType(name: string, dot: number): boolean {
  if (dot <= 0 || dot === name.length - 1) return false;
  return /^[A-Za-z][A-Za-z0-9]{0,7}$/.test(name.slice(dot + 1));
}
