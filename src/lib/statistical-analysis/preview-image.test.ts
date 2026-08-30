import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import {
  ANALYTICS_PREVIEW_MAX_DATA_URL_CHARS,
  analysisPreviewMatchKey,
  asPreviewImage,
  isValidAnalysisPreviewSrc,
  pngBufferFromDataUrl,
} from "./preview-image";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("isValidAnalysisPreviewSrc", () => {
  it("accepts sixpack-sized PNG data URLs that exceed the chat insert cap", () => {
    const payload = "A".repeat(1_600_000);
    const src = `data:image/png;base64,${payload}`;
    expect(src.length).toBeGreaterThan(1_400_000);
    expect(src.length).toBeLessThan(ANALYTICS_PREVIEW_MAX_DATA_URL_CHARS);
    expect(isValidAnalysisPreviewSrc(src)).toBe(true);
  });

  it("rejects data URLs above the analytics preview cap", () => {
    const src = `data:image/png;base64,${"A".repeat(ANALYTICS_PREVIEW_MAX_DATA_URL_CHARS)}`;
    expect(isValidAnalysisPreviewSrc(src)).toBe(false);
  });
});

describe("asPreviewImage", () => {
  it("parses stored preview payloads", () => {
    const preview = {
      dataUrl: "data:image/png;base64,AAAA",
      widthPx: 600,
      heightPx: 400,
      alt: "Torque",
      chartSpec: TORQUE_MOCK_SPEC,
    };
    expect(asPreviewImage(preview)?.alt).toBe("Torque");
    expect(asPreviewImage({ ...preview, dataUrl: "http://evil" })).toBeNull();
  });
});

describe("analysisPreviewMatchKey", () => {
  it("changes when the plot config or source hash changes", () => {
    const before = {
      sourceHash: "h1",
      config: { yColumnId: "c1", mark: "scatter" },
    };
    const afterEdit = {
      sourceHash: "h1",
      config: { yColumnId: "c1", mark: "line" },
    };
    expect(analysisPreviewMatchKey(before)).not.toBe(
      analysisPreviewMatchKey(afterEdit)
    );
    expect(analysisPreviewMatchKey(before)).toBe(analysisPreviewMatchKey(before));
  });
});

describe("pngBufferFromDataUrl", () => {
  it("decodes a PNG data URL", () => {
    const buffer = pngBufferFromDataUrl(TINY_PNG);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer?.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  it("rejects non-png URLs", () => {
    expect(pngBufferFromDataUrl("data:image/jpeg;base64,AAAA")).toBeNull();
    expect(pngBufferFromDataUrl("http://example.com/plot.png")).toBeNull();
  });
});
