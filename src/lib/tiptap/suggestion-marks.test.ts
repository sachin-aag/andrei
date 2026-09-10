import { describe, expect, it } from "vitest";
import { Fragment, Schema, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import {
  continuingInsertAttrs,
  sliceHasText,
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
  stripSuggestionMarksFromSlice,
  trackChangesSelectionReplaceTransaction,
  trackChangesTextInputTransaction,
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

function insertMark(id: string, authorId = "user-1") {
  return schema.marks[suggestionInsertMarkName]!.create({
    id,
    authorId,
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

function textMarkNames(paragraph: PMNode) {
  const rows: { text: string; marks: string[]; insertId?: string }[] = [];
  paragraph.forEach((node) => {
    if (!node.isText) return;
    const insert = node.marks.find(
      (mark) => mark.type.name === suggestionInsertMarkName
    );
    rows.push({
      text: node.text ?? "",
      marks: node.marks.map((mark) => mark.type.name),
      insertId: insert ? String(insert.attrs.id) : undefined,
    });
  });
  return rows;
}

describe("continuingInsertAttrs", () => {
  it("reuses the pending insert mark at an empty caret after typed text", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("h", [insertMark("run-1")])]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    });

    expect(continuingInsertAttrs(state, 2, "user-1").id).toBe("run-1");
  });

  it("starts a new insert run when the caret is not in pending insert text", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hello")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6),
    });

    const first = continuingInsertAttrs(state, 6, "user-1");
    const second = continuingInsertAttrs(state, 6, "user-1");
    expect(first.authorId).toBe("user-1");
    expect(first.status).toBe("pending");
    expect(first.id).not.toBe(second.id);
  });
});

function helloThenEmpty() {
  return schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("hello")]),
    schema.node("paragraph", null, []),
  ]);
}

function typedDoc(
  state: EditorState,
  from: number,
  to: number,
  text = "a"
) {
  const tr = trackChangesTextInputTransaction(state, from, to, text, "user-1");
  expect(tr).not.toBeNull();
  return state.apply(tr!);
}

describe("sliceHasText", () => {
  it("is false for splitBlock / Enter", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hello")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6),
    });
    const step = state.tr.split(6).steps[0];
    expect(step).toBeInstanceOf(ReplaceStep);
    expect(sliceHasText((step as ReplaceStep).slice)).toBe(false);
  });

  it("is true for an inserted character", () => {
    const slice = new Slice(Fragment.from(schema.text("e")), 0, 0);
    expect(sliceHasText(slice)).toBe(true);
  });
});

describe("trackChangesTextInputTransaction", () => {
  it("does not strikethrough the previous letter when Chrome reports a span range", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("h", [insertMark("run-1")])]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    });

    const next = typedDoc(state, 1, 2, "e");
    expect(next.doc.textBetween(0, next.doc.content.size, " ")).toBe("he");

    const rows = textMarkNames(next.doc.firstChild!);
    expect(rows.every((row) => !row.marks.includes(suggestionDeleteMarkName))).toBe(
      true
    );
    expect(rows.map((row) => row.text).join("")).toBe("he");
    expect(rows.every((row) => row.insertId === "run-1")).toBe(true);
  });

  it.each([
    {
      name: "the caret is in the new paragraph",
      selection: (doc: ReturnType<typeof helloThenEmpty>) =>
        TextSelection.create(doc, 8),
      from: 6,
      to: 8,
    },
    {
      name: "the caret is still in the previous paragraph",
      selection: (doc: ReturnType<typeof helloThenEmpty>) =>
        TextSelection.create(doc, 6),
      from: 6,
      to: 8,
    },
    {
      name: "the caret is on the block gap",
      selection: (doc: ReturnType<typeof helloThenEmpty>) =>
        TextSelection.create(doc, 7),
      from: 6,
      to: 8,
    },
    {
      name: "Chrome selected the empty Enter split",
      selection: (doc: ReturnType<typeof helloThenEmpty>) =>
        TextSelection.create(doc, 6, 9),
      from: 6,
      to: 9,
    },
  ])("types into the new line when $name", ({ selection, from, to }) => {
    const doc = helloThenEmpty();
    const state = EditorState.create({ doc, selection: selection(doc) });
    const next = typedDoc(state, from, to);
    expect(next.doc.childCount).toBe(2);
    expect(next.doc.textBetween(0, next.doc.content.size, "|")).toBe("hello|a");
    expect(next.selection.$from.parent.inlineContent).toBe(true);
  });

  it("inserts at the caret when Chrome's range covers a later suggestion span", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("AAA"),
        schema.text("SUGGESTION", [insertMark("ai-span", "ai")]),
        schema.text("BBB"),
      ]),
    ]);
    const caret = 4;
    const suggestionFrom = 4;
    const suggestionTo = 14;
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, caret),
    });

    const next = typedDoc(state, suggestionFrom, suggestionTo, "x");
    expect(next.doc.textBetween(0, next.doc.content.size, "")).toBe(
      "AAAxSUGGESTIONBBB"
    );
    expect(next.selection.from).toBe(5);
  });

  it("inserts at the caret when Chrome's range covers a later paragraph's AI span", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("AAA")]),
      schema.node("paragraph", null, [
        schema.text("SUGGESTION", [insertMark("ai-span", "ai")]),
      ]),
    ]);
    let caret = 0;
    let suggestionTo = 0;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === "AAA") caret = pos + node.nodeSize;
      if (node.isText && node.text === "SUGGESTION") {
        suggestionTo = pos + node.nodeSize;
      }
    });
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, caret),
    });

    const next = typedDoc(state, caret, suggestionTo, "x");
    expect(next.doc.textBetween(0, next.doc.content.size, "|")).toBe(
      "AAAx|SUGGESTION"
    );
    expect(next.selection.from).toBe(caret + 1);
  });

  it("does not type into a pending AI insert mark", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("AAA"),
        schema.text("SUGGESTION", [insertMark("ai-span", "ai")]),
        schema.text("BBB"),
      ]),
    ]);
    const caretInsideSuggestion = 8;
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, caretInsideSuggestion),
    });

    expect(
      trackChangesTextInputTransaction(
        state,
        caretInsideSuggestion,
        caretInsideSuggestion,
        "x",
        "user-1"
      )
    ).toBeNull();
  });

  it("inserts at a collapsed caret when there is no AI span", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("ab")]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });

    const next = typedDoc(state, 3, 3, "c");
    expect(next.doc.textBetween(0, next.doc.content.size, "")).toBe("abc");
    const rows = textMarkNames(next.doc.firstChild!);
    expect(rows.some((row) => row.text === "c")).toBe(true);
    expect(rows.find((row) => row.text === "c")?.marks).toContain(
      suggestionInsertMarkName
    );
  });

  it("does not type into an AI delete mark", () => {
    const deleteMark = schema.marks[suggestionDeleteMarkName]!.create({
      id: "ai-span",
      authorId: "ai",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("OLD", [deleteMark]),
        schema.text("NEW", [insertMark("ai-span", "ai")]),
      ]),
    ]);
    const caret = 3;
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, caret),
    });

    expect(
      trackChangesTextInputTransaction(state, caret, caret, "x", "user-1")
    ).toBeNull();
  });

  it("inserts at a collapsed caret next to an AI span without joining that mark", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("AAA"),
        schema.text("SUGGESTION", [insertMark("ai-span", "ai")]),
      ]),
    ]);
    const caret = 4;
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, caret),
    });

    const next = typedDoc(state, caret, caret, "x");
    expect(next.doc.textBetween(0, next.doc.content.size, "")).toBe(
      "AAAxSUGGESTION"
    );
    const rows = textMarkNames(next.doc.firstChild!);
    expect(rows.find((row) => row.text === "x")?.insertId).not.toBe("ai-span");
    expect(rows.find((row) => row.text === "SUGGESTION")?.insertId).toBe(
      "ai-span"
    );
  });

  it("still treats a real selection as delete-plus-insert", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("The original sentence.")]),
    ]);
    const from = 1 + "The ".length;
    const to = from + "original".length;
    const baseState = EditorState.create({ doc });
    const state = baseState.apply(
      baseState.tr.setSelection(TextSelection.create(doc, from, to))
    );

    const tr = trackChangesTextInputTransaction(
      state,
      from,
      to,
      "replacement",
      "user-1"
    );
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    const rows = textMarkNames(next.doc.firstChild!);
    expect(
      rows.some(
        (row) =>
          row.text === "original" &&
          row.marks.includes(suggestionDeleteMarkName)
      )
    ).toBe(true);
    expect(
      rows.some(
        (row) =>
          row.text === "replacement" &&
          row.marks.includes(suggestionInsertMarkName)
      )
    ).toBe(true);
  });
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
