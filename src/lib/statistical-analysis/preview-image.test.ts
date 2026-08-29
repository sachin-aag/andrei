import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { asPreviewImage, pngBufferFromDataUrl } from "./preview-image";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
