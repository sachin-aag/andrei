import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  appendParagraphsToDoc,
  legacyStringToDoc,
  replaceTextInDoc,
  richJsonToPlainText,
  stripSuggestionMarksFromDoc,
} from "@/lib/tiptap/rich-text";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

describe("rich text helpers", () => {
  it("converts legacy plain text into paragraph nodes", () => {
    expect(legacyStringToDoc("Line one\nLine two")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Line one" }] },
        { type: "paragraph", content: [{ type: "text", text: "Line two" }] },
      ],
    });
  });

  it("extracts plain text from paragraphs, headings, and lists", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Root cause" }] },
        { type: "paragraph", content: [{ type: "text", text: "Observed during review." }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Batch record" }] }] },
          ],
        },
      ],
    };

    expect(richJsonToPlainText(doc)).toBe("Root cause\nObserved during review.\n\nBatch record");
  });

  it("replaces text with whitespace-tolerant anchor matching", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "The deviation was observed" },
            { type: "text", text: " during routine analysis." },
          ],
        },
      ],
    };

    const result = replaceTextInDoc(
      doc,
      "deviation   was observed during",
      "deviation was documented during",
    );

    expect(result.replaced).toBe(true);
    expect(richJsonToPlainText(result.doc)).toBe(
      "The deviation was documented during routine analysis.",
    );
  });

  it("appends multi-line suggestions as separate paragraphs", () => {
    const doc: JSONContent = { type: "doc", content: [] };

    expect(appendParagraphsToDoc(doc, "First\nSecond")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    });
  });

  it("extracts pipe-separated plain text from table nodes", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Header 1" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Header 2" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Data 1" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Data 2" }] }] },
              ],
            },
          ],
        },
      ],
    };

    expect(richJsonToPlainText(doc)).toBe("Header 1 | Header 2\nData 1 | Data 2");
  });

  it("handles table mixed with paragraphs", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before table." }] },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] },
              ],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "After table." }] },
      ],
    };

    expect(richJsonToPlainText(doc)).toBe("Before table.\n\nA | B\n\nAfter table.");
  });

  it("strips suggestion marks while keeping other marks", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Reviewed text",
              marks: [
                { type: suggestionInsertMarkName },
                { type: suggestionDeleteMarkName },
                { type: "bold" },
              ],
            },
          ],
        },
      ],
    };

    expect(stripSuggestionMarksFromDoc(doc).content?.[0]?.content?.[0]?.marks).toEqual([
      { type: "bold" },
    ]);
  });
});
