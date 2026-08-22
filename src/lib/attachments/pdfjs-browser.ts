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
 * Single streamed GET. `disableRange` is deliberate, not an oversight.
 *
 * Range loading only pays off for PDFs whose xref pdf.js can parse from the
 * tail chunk alone. Our uploads (Word/scanner exports, merged appendices) fail
 * that: `loadDocument()` throws `XRefParseException`, and pdf.js recovers by
 * calling `requestLoadedStream()` — which fetches *every* remaining chunk
 * before retrying. Measured against real report attachments:
 *
 *   4.9 MB / 62 pages    ->  6 requests, 200% of the file transferred
 *   130 MB / 1003 pages  -> 120 requests, 195% of the file transferred
 *
 * Every one of those is an authenticated round trip through the content route
 * (session + two DB queries + a GCS read), so ranges were strictly slower than
 * one GET. With `disableRange` it is 1 request and 100%, and the worker parses
 * as bytes arrive. Re-measure before turning ranges back on.
 */
export function pdfjsPreviewLoadingOptions(version: string): ReturnType<
  typeof pdfjsPreviewDocumentOptions
> & {
  /** Cookies still flow: pdf.js maps `false` to `credentials: "same-origin"`. */
  withCredentials: false;
  disableRange: true;
  disableStream: false;
  disableAutoFetch: false;
} {
  return {
    ...pdfjsPreviewDocumentOptions(version),
    withCredentials: false,
    disableRange: true,
    disableStream: false,
    disableAutoFetch: false,
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
