import { describe, expect, it } from "vitest";
import { mapDocumentAiPages, textFromAnchor } from "./document-ai-ocr";

describe("mapDocumentAiPages", () => {
  it("slices full text with page anchors and remaps relative page numbers", () => {
    const full = "COVER\n\nTABLE OF CONTENTS\nSW-PA-1";
    const pages = mapDocumentAiPages(
      {
        text: full,
        pages: [
          {
            pageNumber: 1,
            layout: {
              textAnchor: {
                textSegments: [{ startIndex: 0, endIndex: 5 }],
              },
              confidence: 0.91,
            },
          },
          {
            pageNumber: 2,
            layout: {
              textAnchor: {
                textSegments: [{ startIndex: 7, endIndex: full.length }],
              },
              confidence: 0.8,
            },
          },
        ],
      },
      4
    );

    expect(pages).toEqual([
      { pageNumber: 4, transcript: "COVER", confidence: 0.91 },
      {
        pageNumber: 5,
        transcript: "TABLE OF CONTENTS\nSW-PA-1",
        confidence: 0.8,
      },
    ]);
  });

  it("joins multiple text segments", () => {
    expect(
      textFromAnchor("abcdefghij", {
        textSegments: [
          { startIndex: 0, endIndex: 3 },
          { startIndex: 6, endIndex: 9 },
        ],
      })
    ).toBe("abcghi");
  });
});
