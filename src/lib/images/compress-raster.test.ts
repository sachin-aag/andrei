import { describe, expect, it } from "vitest";
import { compressRasterToDataUrl } from "./compress-raster";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("compressRasterToDataUrl", () => {
  it("encodes a PNG into a suggestion data URL", async () => {
    const compressed = await compressRasterToDataUrl(TINY_PNG);
    expect(compressed).not.toBeNull();
    expect(compressed?.dataUrl.startsWith("data:image/")).toBe(true);
    expect(compressed?.width).toBeGreaterThanOrEqual(1);
    expect(compressed?.height).toBeGreaterThanOrEqual(1);
  });

  it("returns null for empty bytes", async () => {
    expect(await compressRasterToDataUrl(Buffer.alloc(0))).toBeNull();
  });
});
