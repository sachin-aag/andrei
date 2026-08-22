import { describe, expect, it } from "vitest";
import {
  PDFJS_ASSET_CACHE_CONTROL,
  PDFJS_ASSETS_VERSION,
  pdfjsAssetCacheHeaders,
  pdfjsPreviewDocumentOptions,
  pdfjsPreviewLoadingOptions,
  pdfjsWorkerSrc,
} from "@/lib/attachments/pdfjs-browser";

describe("pdfjsPreviewLoadingOptions", () => {
  /**
   * Ranges regressed open time: our PDFs make pdf.js throw XRefParseException
   * and recover by fetching every chunk anyway, so N authenticated round trips
   * replaced one GET. Keep this pinned to one streamed request.
   */
  it("asks pdf.js for one streamed GET, not range fetches", () => {
    expect(pdfjsPreviewLoadingOptions(PDFJS_ASSETS_VERSION)).toEqual({
      ...pdfjsPreviewDocumentOptions(PDFJS_ASSETS_VERSION),
      withCredentials: false,
      disableRange: true,
      disableStream: false,
      disableAutoFetch: false,
    });
  });

  it("leaves credentials off so same-origin cookies still flow", () => {
    // pdf.js maps withCredentials=false to credentials:"same-origin", which
    // keeps the session cookie on the proxy request while allowing a redirect
    // to signed object storage (which cannot echo Allow-Credentials).
    expect(pdfjsPreviewLoadingOptions(PDFJS_ASSETS_VERSION).withCredentials).toBe(
      false
    );
  });
});

describe("pdfjs asset cache", () => {
  it("pins versioned public assets as immutable year-long cache", () => {
    expect(pdfjsAssetCacheHeaders()).toEqual([
      {
        source: "/pdfjs-assets/:version/:path*",
        headers: [
          { key: "Cache-Control", value: PDFJS_ASSET_CACHE_CONTROL },
        ],
      },
    ]);
    expect(PDFJS_ASSET_CACHE_CONTROL).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(pdfjsWorkerSrc()).toBe(
      `/pdfjs-assets/${PDFJS_ASSETS_VERSION}/build/pdf.worker.min.mjs`
    );
  });
});
