import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  applyDrawingOperationToDoc,
  findInlineImageAtIndex,
} from "@/lib/drawings/apply-drawing";
import { emptyImageDrawing, layoutCalloutsLeft } from "@/lib/drawings/overlay";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function docWithImages(count: number): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: Array.from({ length: count }, (_, i) => ({
          type: "imageInline",
          attrs: { src: PNG, alt: `fig-${i + 1}`, width: 400 },
        })),
      },
    ],
  };
}

describe("applyDrawingOperationToDoc", () => {
  it("writes overlay onto the indexed figure", () => {
    const drawing = layoutCalloutsLeft([{ text: "S-1" }, { text: "S-2" }]);
    const result = applyDrawingOperationToDoc(docWithImages(2), {
      index: 2,
      drawing,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("applied");
    expect(findInlineImageAtIndex(result.doc, 2)?.attrs?.drawing).toEqual(drawing);
    expect(findInlineImageAtIndex(result.doc, 1)?.attrs?.drawing).toBeUndefined();
  });

  it("no-ops when the overlay is already present", () => {
    const drawing = layoutCalloutsLeft([{ text: "S-1" }]);
    const first = applyDrawingOperationToDoc(docWithImages(1), { index: 1, drawing });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyDrawingOperationToDoc(first.doc, { index: 1, drawing });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.status).toBe("already_present");
  });

  it("fails when the figure is missing", () => {
    const result = applyDrawingOperationToDoc(docWithImages(1), {
      index: 3,
      drawing: emptyImageDrawing(),
    });
    expect(result).toEqual({ ok: false, status: "not_found" });
  });
});
