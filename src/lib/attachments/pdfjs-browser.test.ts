import { describe, expect, it } from "vitest";
import {
  PDFJS_ASSET_CACHE_CONTROL,
  PDFJS_ASSETS_VERSION,
  PDFJS_RANGE_CHUNK_SIZE,
  pdfjsAssetCacheHeaders,
  pdfjsPreviewDocumentOptions,
  pdfjsPreviewLoadingOptions,
  pdfjsWorkerSrc,
} from "@/lib/attachments/pdfjs-browser";

describe("pdfjsPreviewLoadingOptions", () => {
  it("asks pdf.js for range fetches only, not a full-file download", () => {
    expect(pdfjsPreviewLoadingOptions(PDFJS_ASSETS_VERSION)).toEqual({
      ...pdfjsPreviewDocumentOptions(PDFJS_ASSETS_VERSION),
      withCredentials: true,
      disableRange: false,
      disableStream: true,
      disableAutoFetch: true,
      rangeChunkSize: PDFJS_RANGE_CHUNK_SIZE,
    });
    expect(PDFJS_RANGE_CHUNK_SIZE).toBe(65_536);
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
