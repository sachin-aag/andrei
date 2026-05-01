import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { findPlaceholders } from "@/lib/placeholders/find";

describe("findPlaceholders", () => {
  it("finds bracketed placeholders with and without angle brackets", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Batch [Batch No.: <to be filled>] and analyst [to be filled].",
            },
          ],
        },
      ],
    };

    const placeholders = findPlaceholders(doc, "define", "narrative");

    expect(placeholders).toMatchObject([
      {
        id: "define-narrative-7",
        section: "define",
        contentPath: "narrative",
        fromPos: 7,
        text: "[Batch No.: <to be filled>]",
      },
      {
        section: "define",
        contentPath: "narrative",
        text: "[to be filled]",
      },
    ]);
  });

  it("walks nested text nodes with stable positions", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "No placeholder here." }] },
        { type: "paragraph", content: [{ type: "text", text: "Room [Room ID: <to be filled>]" }] },
      ],
    };

    const [placeholder] = findPlaceholders(doc, "measure", "narrative");

    expect(placeholder).toMatchObject({
      id: "measure-narrative-28",
      fromPos: 28,
      text: "[Room ID: <to be filled>]",
    });
  });
});
