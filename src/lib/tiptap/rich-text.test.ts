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
