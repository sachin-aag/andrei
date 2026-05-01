import { describe, expect, it } from "vitest";
import {
  plainTextFromTiptapJson,
  stringFieldFromStoredValue,
} from "@/lib/section-content-normalize";

describe("section content normalization", () => {
  it("extracts paragraph text from stored Tiptap JSON", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First paragraph" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Second" },
            { type: "hardBreak" },
            { type: "text", text: "paragraph" },
          ],
        },
      ],
    };

    expect(plainTextFromTiptapJson(doc)).toBe(
      "First paragraph\n\nSecond\nparagraph",
    );
  });

  it("keeps strings and coerces non-doc values to empty strings", () => {
    expect(stringFieldFromStoredValue("legacy text")).toBe("legacy text");
    expect(stringFieldFromStoredValue({ type: "paragraph" })).toBe("");
    expect(stringFieldFromStoredValue(null)).toBe("");
  });
});
