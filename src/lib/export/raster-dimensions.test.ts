import { describe, expect, it } from "vitest";
import { readJpegDimensions, readPngDimensions, readRasterDimensions } from "@/lib/export/raster-dimensions";

describe("readPngDimensions", () => {
  it("reads IHDR width and height", () => {
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    expect(readPngDimensions(tinyPng)).toEqual({ width: 1, height: 1 });
  });
});

describe("readRasterDimensions", () => {
  it("dispatches by mime type", () => {
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    expect(readRasterDimensions(tinyPng, "image/png")).toEqual({ width: 1, height: 1 });
    expect(readJpegDimensions(tinyPng)).toBeNull();
  });
});
