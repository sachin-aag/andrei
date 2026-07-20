import { describe, expect, it } from "vitest";
import { Fragment, Schema, Slice } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
  stripSuggestionMarksFromSlice,
  trackChangesSelectionReplaceTransaction,
} from "@/lib/tiptap/suggestion-marks";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {
    bold: {
      toDOM: () => ["strong", 0],
    },
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

describe("stripSuggestionMarksFromSlice", () => {
  it("removes AI insert and delete marks while keeping other formatting", () => {
    const insert = schema.marks[suggestionInsertMarkName]!.create({
      id: "ai-1",
      authorId: "ai",
      status: "pending",
      createdAt: "",
    });
    const del = schema.marks[suggestionDeleteMarkName]!.create({
      id: "ai-1",
      authorId: "ai",
      status: "pending",
      createdAt: "",
    });
    const bold = schema.marks.bold!.create();

    const slice = new Slice(
      Fragment.from(
        schema.node("paragraph", null, [
          schema.text("old", [del]),
          schema.text("new", [insert, bold]),
        ])
      ),
      0,
      0
    );

    const stripped = stripSuggestionMarksFromSlice(slice);
    const paragraph = stripped.content.firstChild!;
    expect(paragraph.childCount).toBe(2);
    expect(paragraph.child(0).text).toBe("old");
    expect(paragraph.child(0).marks).toEqual([]);
    expect(paragraph.child(1).text).toBe("new");
    expect(paragraph.child(1).marks.map((mark) => mark.type.name)).toEqual([
      "bold",
    ]);
  });

  it("strips human track-change marks from copied text", () => {
    const insert = schema.marks[suggestionInsertMarkName]!.create({
      id: "tc-1",
      authorId: "user-1",
      status: "pending",
      createdAt: "",
    });

    const slice = new Slice(
      Fragment.from(
        schema.node("paragraph", null, [schema.text("typed with TC", [insert])])
      ),
      1,
      1
    );

    const stripped = stripSuggestionMarksFromSlice(slice);
    expect(stripped.openStart).toBe(1);
    expect(stripped.openEnd).toBe(1);
    const text = stripped.content.firstChild!.firstChild!;
    expect(text.text).toBe("typed with TC");
    expect(text.marks).toEqual([]);
  });
});
