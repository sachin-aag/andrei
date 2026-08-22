/**
 * Same-origin URLs for the official pdf.js worker, JBIG2/OpenJPEG wasm, and
 * standard fonts. The serverless `unpdf` bundle does not load these, so scanned
 * pages (JBIG2) and unembedded Helvetica/Times collapse to empty table shells.
 *
 * `version` must be `pdfjs-dist`'s `version`. `scripts/copy-pdfjs-assets.mjs`
 * publishes those files to `public/pdfjs-assets/<version>/`.
 */

/** Must match `pdfjs-dist` and `public/pdfjs-assets/<version>/`. */
export const PDFJS_ASSETS_VERSION = "6.1.200";

/** pdf.js default. Files larger than 2× this use HTTP Range instead of a full GET. */
export const PDFJS_RANGE_CHUNK_SIZE = 65_536;

/** Version-stamped static assets never change; cache them for a year. */
export const PDFJS_ASSET_CACHE_CONTROL =
  "public, max-age=31536000, immutable";

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

/**
 * Range-only load. `disableStream` is required for `disableAutoFetch` — otherwise
 * pdf.js keeps downloading the rest of the file after page 1 is on screen.
 */
export function pdfjsPreviewLoadingOptions(version: string): ReturnType<
  typeof pdfjsPreviewDocumentOptions
> & {
  withCredentials: true;
  disableRange: false;
  disableStream: true;
  disableAutoFetch: true;
  rangeChunkSize: number;
} {
  return {
    ...pdfjsPreviewDocumentOptions(version),
    withCredentials: true,
    disableRange: false,
    disableStream: true,
    disableAutoFetch: true,
    rangeChunkSize: PDFJS_RANGE_CHUNK_SIZE,
  };
}

export function pdfjsWorkerSrc(
  version: string = PDFJS_ASSETS_VERSION
): string {
  return `/pdfjs-assets/${version}/build/pdf.worker.min.mjs`;
}

export function pdfjsAssetCacheHeaders(): {
  source: string;
  headers: { key: string; value: string }[];
}[] {
  return [
    {
      source: "/pdfjs-assets/:version/:path*",
      headers: [
        { key: "Cache-Control", value: PDFJS_ASSET_CACHE_CONTROL },
      ],
    },
  ];
}
