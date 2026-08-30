import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  bodyAppendIndex,
  insertNodesIntoFieldBody,
  lastPairedBlockIndex,
} from "@/lib/suggestions/block-insert";
import { fieldBodyInsertIndex } from "@/lib/suggestions/citations-at-end";

function paragraph(text?: string): JSONContent {
  return text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
}

function table(): JSONContent {
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [paragraph("A")],
          },
        ],
      },
    ],
  };
}

function imagePara(): JSONContent {
  return {
    type: "paragraph",
    content: [
      {
        type: "imageInline",
        attrs: { src: "data:image/png;base64,xx", alt: "fig", width: 400 },
      },
    ],
  };
}

const withCitations: JSONContent = {
  type: "doc",
  content: [
    paragraph("Purpose of this verification."),
    paragraph("Citations:"),
    paragraph("1. [protocol.pdf, p. 3]"),
  ],
};

describe("fieldBodyInsertIndex", () => {
  it("cuts before a trailing Citations heading", () => {
    expect(fieldBodyInsertIndex(withCitations)).toBe(1);
  });

  it("replaces a dangling empty paragraph when there is no citation block", () => {
    expect(
      fieldBodyInsertIndex({
        type: "doc",
        content: [paragraph("Body."), paragraph()],
      })
    ).toBe(1);
  });
});

describe("insertNodesIntoFieldBody", () => {
  it("inserts before trailing Citations", () => {
    const doc = structuredClone(withCitations);
    insertNodesIntoFieldBody(doc, [table()]);
    expect(doc.content?.map((n) => n.type)).toEqual([
      "paragraph",
      "table",
      "paragraph",
      "paragraph",
    ]);
    expect(doc.content?.[2]?.content?.[0]?.text).toBe("Citations:");
  });

  it("inserts before the last table when beforePairedBlock is table", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        paragraph("Intro."),
        table(),
        paragraph("Citations:"),
        paragraph("1. [protocol.pdf, p. 1]"),
      ],
    };
    expect(lastPairedBlockIndex(doc, "table")).toBe(1);
    expect(bodyAppendIndex(doc, "table")).toBe(1);
    insertNodesIntoFieldBody(doc, [paragraph("Lead-in.")], {
      beforePairedBlock: "table",
    });
    expect(doc.content?.[1]?.content?.[0]?.text).toBe("Lead-in.");
    expect(doc.content?.[2]?.type).toBe("table");
  });

  it("finds the last image block before Citations", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        paragraph("Intro."),
        imagePara(),
        paragraph("Citations:"),
      ],
    };
    expect(lastPairedBlockIndex(doc, "image")).toBe(1);
  });
});
