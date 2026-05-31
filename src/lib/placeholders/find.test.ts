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
        id: "define-narrative-8",
        section: "define",
        contentPath: "narrative",
        fromPos: 8,
        text: "[Batch No.: <to be filled>]",
      },
      {
        section: "define",
        contentPath: "narrative",
        text: "[to be filled]",
      },
    ]);
  });

  it("finds placeholders split across adjacent text nodes", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "CAPA " },
            { type: "text", text: "[CAPA number: <to be filled>]" },
            { type: "text", text: ", assigned to [Responsible person: <to be filled>]." },
          ],
        },
      ],
    };

    const found = findPlaceholders(doc, "improve", "narrative");

    expect(found.map((p) => p.text).sort()).toEqual(
      [
        "[CAPA number: <to be filled>]",
        "[Responsible person: <to be filled>]",
      ].sort()
    );
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
      id: "measure-narrative-29",
      fromPos: 29,
      text: "[Room ID: <to be filled>]",
    });
  });

  it("ignores static SOP acceptance criteria wrapped in brackets", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "If results are within the acceptance criteria [TOC of blank water: Not More Than 100 ppb, %CV: Not More Than 5.0%, and SD: Not More Than 0.5 (either %CV or SD should comply)], then suitability shall be performed.",
            },
          ],
        },
      ],
    };

    expect(findPlaceholders(doc, "define", "narrative")).toEqual([]);
  });

  it("treats bracket guidance without to be filled as placeholders but skips numeric citations", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: 'Observed [description of particulate, e.g., fibers] in [number] vials; see ref [12]. Per [SOP No.: <to be filled>].',
            },
          ],
        },
      ],
    };

    const found = findPlaceholders(doc, "define", "narrative");

    expect(found.map((p) => p.text).sort()).toEqual(
      [
        "[SOP No.: <to be filled>]",
        "[description of particulate, e.g., fibers]",
        "[number]",
      ].sort()
    );
  });
});
