import { describe, expect, it } from "vitest";
import { flattenDrawingsInValue } from "@/lib/drawings/flatten";
import { layoutCalloutsLeft } from "@/lib/drawings/overlay";

/** 1×1 PNG — valid raster so napi-canvas can load it. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("flattenDrawingsInValue", () => {
  it("bakes overlay shapes into the image src and clears the drawing attr", async () => {
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
        content: Array<{ attrs: { src: string; drawing: unknown } }>;
      }>;
    };
    const attrs = next.content[0]!.content[0]!.attrs;
    expect(attrs.drawing).toBeNull();
    expect(attrs.src.startsWith("data:image/png;base64,")).toBe(true);
    expect(attrs.src).not.toBe(PNG);
  });

  it("leaves figures without overlays unchanged", async () => {
    const value = {
      type: "imageInline",
      attrs: { src: PNG, alt: "plain" },
    };
    await expect(flattenDrawingsInValue(value)).resolves.toEqual(value);
  });
});
