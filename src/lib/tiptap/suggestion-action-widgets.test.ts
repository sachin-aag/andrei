import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { collectSuggestionActionWidgetPositions } from "@/lib/tiptap/suggestion-action-widgets";
import { extendPosPastOpenBracketClose } from "@/lib/text/bracket-span";

function docWithMarks() {
  const schema = new Schema({
    nodes: {
      doc: { content: "paragraph" },
      paragraph: { content: "text*", group: "block" },
      text: { group: "inline" },
    },
    marks: {
      suggestionInsert: {
        attrs: {
          id: { default: null },
          authorId: { default: "" },
          status: { default: "pending" },
          createdAt: { default: "" },
          kind: { default: "fix" },
        },
        inclusive: true,
        toDOM: () => ["span", 0],
      },
      suggestionDelete: {
        attrs: {
          id: { default: null },
          authorId: { default: "" },
          status: { default: "pending" },
          createdAt: { default: "" },
          kind: { default: "fix" },
        },
        inclusive: false,
        toDOM: () => ["span", 0],
      },
    },
  });

  const insert = schema.marks.suggestionInsert!.create({
    id: "eval-1",
    authorId: "ai",
    status: "pending",
    createdAt: "",
    kind: "fix",
  });
  const del = schema.marks.suggestionDelete!.create({
    id: "eval-1",
    authorId: "ai",
    status: "pending",
    createdAt: "",
    kind: "fix",
  });

  return schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("Sp", [del]),
      schema.text("ecify the location where work happens.", [insert]),
    ]),
  ]);
}

describe("collectSuggestionActionWidgetPositions", () => {
  it("anchors widgets after insert marks, not early delete fragments", () => {
    const doc = docWithMarks();
    const positions = collectSuggestionActionWidgetPositions(
      doc,
      new Set(["eval-1"])
    );
    const deleteEnd = 1 + "Sp".length;
    const insertEnd = deleteEnd + "ecify the location where work happens.".length;
    expect(positions.get("eval-1")).toBe(insertEnd);
    expect(positions.get("eval-1")).toBeGreaterThan(deleteEnd);
  });

  it("places widgets after ] when insert ends inside a bracket placeholder", () => {
    const schema = new Schema({
      nodes: {
        doc: { content: "paragraph" },
        paragraph: { content: "text*", group: "block" },
        text: { group: "inline" },
      },
      marks: {
        suggestionInsert: {
          attrs: {
            id: { default: null },
            authorId: { default: "" },
            status: { default: "pending" },
            createdAt: { default: "" },
            kind: { default: "fix" },
          },
          inclusive: true,
          toDOM: () => ["span", 0],
        },
      },
    });

    const insert = schema.marks.suggestionInsert!.create({
      id: "eval-bracket",
      authorId: "ai",
      status: "pending",
      createdAt: "",
      kind: "fix",
    });

    const prefix = "at [Time of detection: <to be filled>";
    const suffix = "] in lab";
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text(prefix, [insert]),
        schema.text(suffix),
      ]),
    ]);

    const insertEnd = 1 + prefix.length;
    const positions = collectSuggestionActionWidgetPositions(
      doc,
      new Set(["eval-bracket"])
    );
    expect(positions.get("eval-bracket")).toBe(
      extendPosPastOpenBracketClose(doc, insertEnd)
    );
  });
});
