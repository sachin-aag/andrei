import { describe, expect, it } from "vitest";
import { flattenDrawingsInValue } from "@/lib/drawings/flatten";
import { layoutCalloutsLeft, parseImageDrawing } from "@/lib/drawings/overlay";

/** 1×1 PNG — valid raster so napi-canvas can load it. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("flattenDrawingsInValue", () => {
  it("keeps the original src and drawing and adds a baked flattenedSrc", async () => {
    const drawing = layoutCalloutsLeft([{ text: "S-1", tipX: 0.8, tipY: 0.4 }]);
    const next = (await flattenDrawingsInValue({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "imageInline",
              attrs: { src: PNG, alt: "vessel", drawing },
            },
          ],
        },
      ],
    })) as {
      content: Array<{
        content: Array<{
          attrs: { src: string; drawing: unknown; flattenedSrc?: string };
        }>;
      }>;
    };
    const attrs = next.content[0]!.content[0]!.attrs;
    expect(attrs.src).toBe(PNG);
    expect(attrs.drawing).toEqual(drawing);
    expect(attrs.flattenedSrc?.startsWith("data:image/png;base64,")).toBe(true);
    expect(attrs.flattenedSrc).not.toBe(PNG);
  });

  it("leaves figures without overlays unchanged", async () => {
    const value = {
      type: "imageInline",
      attrs: { src: PNG, alt: "plain" },
    };
    await expect(flattenDrawingsInValue(value)).resolves.toEqual(value);
  });

  it("expands the raster so labels outside the photo are not clipped", async () => {
    const drawing = parseImageDrawing({
      shapes: [{ type: "label", x: -0.5, y: 0.1, w: 0.4, h: 0.2, text: "S-1" }],
    });
    const next = (await flattenDrawingsInValue({
      type: "imageInline",
      attrs: { src: PNG, drawing },
    })) as { attrs: { src: string; flattenedSrc?: string } };
    expect(next.attrs.src).toBe(PNG);
    const size = pngSize(next.attrs.flattenedSrc ?? "");
    expect(size.width).toBeGreaterThan(1);
  });
});

function pngSize(dataUrl: string): { width: number; height: number } {
  const base64 = dataUrl.split(",")[1] ?? "";
  const buffer = Buffer.from(base64, "base64");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
