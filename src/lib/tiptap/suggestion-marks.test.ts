import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
  trackChangesSelectionReplaceTransaction,
} from "@/lib/tiptap/suggestion-marks";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {
    [suggestionInsertMarkName]: {
      attrs: {
        id: { default: null },
        authorId: { default: "" },
        status: { default: "pending" },
        createdAt: { default: "" },
      },
      toDOM: () => ["span", 0],
    },
    [suggestionDeleteMarkName]: {
      attrs: {
        id: { default: null },
        authorId: { default: "" },
        status: { default: "pending" },
        createdAt: { default: "" },
      },
      inclusive: false,
      toDOM: () => ["span", 0],
    },
  },
});

describe("trackChangesSelectionReplaceTransaction", () => {
  it("preserves selected text as a deletion when typing a replacement", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("The original sentence.")]),
    ]);
    const from = 1 + "The ".length;
    const to = from + "original".length;
    const baseState = EditorState.create({ doc });
    const state = baseState.apply(
      baseState.tr.setSelection(TextSelection.create(doc, from, to))
    );

    const tr = trackChangesSelectionReplaceTransaction(
      state,
      from,
      to,
      "replacement",
      "user-1"
    );

    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(next.doc.textBetween(0, next.doc.content.size, " ")).toBe(
      "The originalreplacement sentence."
    );

    const paragraph = next.doc.firstChild!;
    const deleted = paragraph.child(1);
    const inserted = paragraph.child(2);

    expect(deleted.text).toBe("original");
    expect(deleted.marks.map((mark) => mark.type.name)).toContain(
      suggestionDeleteMarkName
    );
    expect(inserted.text).toBe("replacement");
    expect(inserted.marks.map((mark) => mark.type.name)).toContain(
      suggestionInsertMarkName
    );
  });
});
