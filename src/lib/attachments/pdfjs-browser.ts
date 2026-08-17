/**
 * Same-origin URLs for the official pdf.js worker, JBIG2/OpenJPEG wasm, and
 * standard fonts. The serverless `unpdf` bundle does not load these, so scanned
 * pages (JBIG2) and unembedded Helvetica/Times collapse to empty table shells.
 *
 * `version` must be `pdfjs-dist`'s `version`. `scripts/copy-pdfjs-assets.mjs`
 * publishes those files to `public/pdfjs-assets/<version>/`.
 */
export function pdfjsPreviewDocumentOptions(version: string): {
  wasmUrl: string;
  standardFontDataUrl: string;
  cMapUrl: string;
  cMapPacked: true;
  useSystemFonts: true;
  useWasm: true;
} {
  const base = `/pdfjs-assets/${version}`;
  return {
    wasmUrl: `${base}/wasm/`,
    standardFontDataUrl: `${base}/standard_fonts/`,
    cMapUrl: `${base}/cmaps/`,
    cMapPacked: true,
    useSystemFonts: true,
    useWasm: true,
  };
}

export function pdfjsWorkerSrc(version: string): string {
  return `/pdfjs-assets/${version}/build/pdf.worker.min.mjs`;
}
