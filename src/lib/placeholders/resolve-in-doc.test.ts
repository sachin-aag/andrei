import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { getPlaceholderSurroundingText } from "./resolve-in-doc";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", group: "block" },
    text: { group: "inline" },
  },
});

describe("getPlaceholderSurroundingText", () => {
  it("returns empty strings for out-of-range positions", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Hello world")]),
    ]);
    expect(getPlaceholderSurroundingText(doc, -1, 3)).toEqual({
      beforeCtx: "",
      afterCtx: "",
    });
    expect(getPlaceholderSurroundingText(doc, 0, doc.content.size + 5)).toEqual({
      beforeCtx: "",
      afterCtx: "",
    });
  });

  it("does not throw when from >= to", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("ab")]),
    ]);
    expect(() => getPlaceholderSurroundingText(doc, 5, 3)).not.toThrow();
    expect(getPlaceholderSurroundingText(doc, 5, 3)).toEqual({
      beforeCtx: "",
      afterCtx: "",
    });
  });
});
