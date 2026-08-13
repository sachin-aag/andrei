import { describe, expect, it } from "vitest";
import { chunkDocumentPages } from "./chunk-pages";

describe("chunkDocumentPages", () => {
  it("creates page-bounded quote and visual chunks with context prefixes", () => {
    const chunks = chunkDocumentPages({
      filename: "evidence.pdf",
      pages: [
        {
          id: "page_1",
          pageNumber: 1,
          transcript: "Line one. Line two.",
          visualInterpretation: "A stamped approval box is visible.",
          pageContext: "Batch release record",
        },
      ],
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      pageId: "page_1",
      pageNumber: 1,
      ordinal: 0,
      rawText: "Line one. Line two.",
      sourceKind: "quote",
    });
    expect(chunks[1]).toMatchObject({
      ordinal: 1,
      sourceKind: "visual_interpretation",
    });
    expect(chunks[0].contextualText).toBe(
      "Document: evidence.pdf | Page 1 | Batch release record\n\nLine one. Line two."
    );
  });

  it("splits long page text without crossing page boundaries", () => {
    const chunks = chunkDocumentPages({
      filename: "evidence.pdf",
      maxChars: 30,
      overlapChars: 5,
      pages: [
        {
          id: "page_1",
          pageNumber: 1,
          transcript: "First page sentence one. First page sentence two.",
          visualInterpretation: "",
          pageContext: null,
        },
        {
          id: "page_2",
          pageNumber: 2,
          transcript: "Second page sentence one. Second page sentence two.",
          visualInterpretation: "",
          pageContext: null,
        },
      ],
    });

    expect(new Set(chunks.map((chunk) => chunk.pageNumber))).toEqual(
      new Set([1, 2])
    );
    expect(chunks.every((chunk) => chunk.rawText.includes("page"))).toBe(true);
    expect(chunks.every((chunk) => chunk.rawText.length <= 35)).toBe(true);
  });
});
