import { describe, expect, it } from "vitest";
import { Schema, Slice } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  collectLockedSuggestionRanges,
  isLockedSuggestionMark,
  rangeTouchesLockedSuggestion,
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
  trackChangesTextInputTransaction,
  transactionEditsLockedSuggestion,
} from "@/lib/tiptap/suggestion-marks";
import {
  skipLockedSuggestionOnBackspace,
  skipLockedSuggestionOnDelete,
} from "@/lib/tiptap/suggestion-preview-lock";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
    imageInline: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: {
        src: { default: null },
        suggestionId: { default: null },
        suggestionKind: { default: null },
      },
    },
  },
  marks: {
    [suggestionInsertMarkName]: {
      attrs: {
        id: { default: null },
        authorId: { default: "" },
        status: { default: "pending" },
        createdAt: { default: "" },
      },
      inclusive: false,
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

function mark(
  name: typeof suggestionInsertMarkName | typeof suggestionDeleteMarkName,
  attrs: { id: string; authorId: string; status?: string }
) {
  return schema.marks[name]!.create({
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "pending",
    ...attrs,
  });
}

function paragraphState(
  ...children: ReturnType<typeof schema.text>[]
) {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, children),
  ]);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1),
  });
}

describe("isLockedSuggestionMark", () => {
  it("locks pending AI insert and delete marks", () => {
    const insert = mark(suggestionInsertMarkName, {
      id: "s1",
      authorId: "ai",
    });
    const del = mark(suggestionDeleteMarkName, { id: "s1", authorId: "ai" });
    expect(isLockedSuggestionMark(insert)).toBe(true);
    expect(isLockedSuggestionMark(del)).toBe(true);
  });

  it("allows accepted marks and human pending inserts", () => {
    const accepted = mark(suggestionInsertMarkName, {
      id: "s1",
      authorId: "ai",
      status: "accepted",
    });
    const human = mark(suggestionInsertMarkName, {
      id: "tc",
      authorId: "user-1",
    });
    const humanDelete = mark(suggestionDeleteMarkName, {
      id: "tc",
      authorId: "user-1",
    });
    expect(isLockedSuggestionMark(accepted)).toBe(false);
    expect(isLockedSuggestionMark(human)).toBe(false);
    expect(isLockedSuggestionMark(humanDelete)).toBe(true);
  });
});

describe("collectLockedSuggestionRanges", () => {
  it("merges adjacent AI delete and insert runs", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("AAA"),
        schema.text("OLD", [
          mark(suggestionDeleteMarkName, { id: "s1", authorId: "ai" }),
        ]),
        schema.text("NEW", [
          mark(suggestionInsertMarkName, { id: "s1", authorId: "ai" }),
        ]),
        schema.text("BBB"),
      ]),
    ]);
    expect(collectLockedSuggestionRanges(doc)).toEqual([{ from: 4, to: 10 }]);
  });

  it("locks a pending Agent figure", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("before"),
        schema.node("imageInline", {
          src: "x",
          suggestionId: "s1",
          suggestionKind: "insert",
        }),
        schema.text("after"),
      ]),
    ]);
    const ranges = collectLockedSuggestionRanges(doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.to - ranges[0]!.from).toBe(1);
  });
});

describe("rangeTouchesLockedSuggestion", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("AAA"),
      schema.text("SUGGESTION", [
        mark(suggestionInsertMarkName, { id: "s1", authorId: "ai" }),
      ]),
      schema.text("BBB"),
    ]),
  ]);

  it("treats a caret at the span edge as outside", () => {
    expect(rangeTouchesLockedSuggestion(doc, 4, 4)).toBe(false);
    expect(rangeTouchesLockedSuggestion(doc, 14, 14)).toBe(false);
  });

  it("treats a caret inside the span as locked", () => {
    expect(rangeTouchesLockedSuggestion(doc, 8, 8)).toBe(true);
  });
});

describe("transactionEditsLockedSuggestion", () => {
  it("flags typing inside a pending AI insert", () => {
    const state = paragraphState(
      schema.text("AAA"),
      schema.text("SUGGESTION", [
        mark(suggestionInsertMarkName, { id: "s1", authorId: "ai" }),
      ]),
      schema.text("BBB")
    );
    const inside = state.tr.insertText("x", 8);
    expect(transactionEditsLockedSuggestion(inside, state)).toBe(true);
    const after = state.tr.insertText("x", 14);
    expect(transactionEditsLockedSuggestion(after, state)).toBe(false);
  });

  it("allows typing inside a human pending insert", () => {
    const state = paragraphState(
      schema.text("hello", [
        mark(suggestionInsertMarkName, { id: "tc", authorId: "user-1" }),
      ])
    );
    const tr = state.tr.insertText("x", 3);
    expect(transactionEditsLockedSuggestion(tr, state)).toBe(false);
  });

  it("allows typing inside an accepted AI insert", () => {
    const state = paragraphState(
      schema.text("hello", [
        mark(suggestionInsertMarkName, {
          id: "s1",
          authorId: "ai",
          status: "accepted",
        }),
      ])
    );
    const tr = state.tr.insertText("x", 3);
    expect(transactionEditsLockedSuggestion(tr, state)).toBe(false);
  });

  it("allows setContent-style full replacements and preventUpdate", () => {
    const state = paragraphState(
      schema.text("OLD", [
        mark(suggestionDeleteMarkName, { id: "s1", authorId: "ai" }),
      ]),
      schema.text("NEW", [
        mark(suggestionInsertMarkName, { id: "s1", authorId: "ai" }),
      ])
    );
    const next = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("applied")]),
    ]);
    const full = state.tr.replace(
      0,
      state.doc.content.size,
      new Slice(next.content, 0, 0)
    );
    expect(transactionEditsLockedSuggestion(full, state)).toBe(false);

    const tagged = state.tr.setMeta("preventUpdate", true).insertText("x", 3);
    expect(transactionEditsLockedSuggestion(tagged, state)).toBe(false);
  });
});

describe("trackChangesTextInputTransaction lock", () => {
  it("does not insert inside a pending AI run", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("AAA"),
        schema.text("SUGGESTION", [
          mark(suggestionInsertMarkName, { id: "s1", authorId: "ai" }),
        ]),
        schema.text("BBB"),
      ]),
    ]);
    const caret = 8;
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, caret),
    });
    expect(
      trackChangesTextInputTransaction(state, caret, caret, "x", "user-1")
    ).toBeNull();
  });

  it("still types at the boundary of an AI run", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("AAA"),
        schema.text("SUGGESTION", [
          mark(suggestionInsertMarkName, { id: "s1", authorId: "ai" }),
        ]),
      ]),
    ]);
    const caret = 4;
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, caret),
    });
    const tr = trackChangesTextInputTransaction(
      state,
      caret,
      caret,
      "x",
      "user-1"
    );
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(next.doc.textBetween(0, next.doc.content.size, "")).toBe(
      "AAAxSUGGESTION"
    );
  });
});

describe("skipLockedSuggestion caret", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("AAA"),
      schema.text("OLD", [
        mark(suggestionDeleteMarkName, { id: "s1", authorId: "ai" }),
      ]),
      schema.text("NEW", [
        mark(suggestionInsertMarkName, { id: "s1", authorId: "ai" }),
      ]),
      schema.text("BBB"),
    ]),
  ]);

  it("jumps Backspace over the merged preview run", () => {
    expect(skipLockedSuggestionOnBackspace(doc, 10)).toBe(4);
    expect(skipLockedSuggestionOnBackspace(doc, 7)).toBe(4);
    expect(skipLockedSuggestionOnBackspace(doc, 4)).toBeNull();
  });

  it("jumps Delete over the merged preview run", () => {
    expect(skipLockedSuggestionOnDelete(doc, 4)).toBe(10);
    expect(skipLockedSuggestionOnDelete(doc, 7)).toBe(10);
    expect(skipLockedSuggestionOnDelete(doc, 10)).toBeNull();
  });
});
