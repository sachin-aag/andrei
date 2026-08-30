import { describe, expect, it } from "vitest";
import { Schema, type Mark, type Node as PMNode } from "@tiptap/pm/model";
import { collectSuggestionActionWidgetPositions } from "@/lib/tiptap/suggestion-action-widgets";
import { extendPosPastOpenBracketClose } from "@/lib/text/bracket-span";

const markAttrs = {
  suggestionInsert: {
    attrs: {
      id: { default: null },
      authorId: { default: "" },
      status: { default: "pending" },
      createdAt: { default: "" },
      kind: { default: "fix" },
    },
    inclusive: true,
    toDOM: () => ["span", 0] as const,
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
    toDOM: () => ["span", 0] as const,
  },
};

function suggestionSchema(multiBlock = false) {
  return new Schema({
    nodes: {
      doc: { content: multiBlock ? "block+" : "paragraph" },
      paragraph: { content: "text*", group: "block" },
      text: { group: "inline" },
    },
    marks: markAttrs,
  });
}

function aiMarks(schema: Schema, id: string): { insert: Mark; del: Mark } {
  const attrs = {
    id,
    authorId: "ai",
    status: "pending",
    createdAt: "",
    kind: "fix",
  };
  return {
    insert: schema.marks.suggestionInsert!.create(attrs),
    del: schema.marks.suggestionDelete!.create(attrs),
  };
}

function positionsFor(doc: PMNode, id: string) {
  return collectSuggestionActionWidgetPositions(doc, new Set([id])).map(
    (anchor) => anchor.pos
  );
}

function docWithMarks() {
  const schema = suggestionSchema();
  const { insert, del } = aiMarks(schema, "eval-1");
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
    const deleteEnd = 1 + "Sp".length;
    const insertEnd = deleteEnd + "ecify the location where work happens.".length;
    expect(positionsFor(doc, "eval-1")).toEqual([insertEnd]);
    expect(insertEnd).toBeGreaterThan(deleteEnd);
  });

  it("places widgets after ] when insert ends inside a bracket placeholder", () => {
    const schema = suggestionSchema();
    const { insert } = aiMarks(schema, "eval-bracket");
    const prefix = "at [Time of detection: <to be filled>";
    const suffix = "] in lab";
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text(prefix, [insert]),
        schema.text(suffix),
      ]),
    ]);

    const insertEnd = 1 + prefix.length;
    expect(positionsFor(doc, "eval-bracket")).toEqual([
      extendPosPastOpenBracketClose(doc, insertEnd),
    ]);
  });

  it("keeps one widget for a split body edit plus citation", () => {
    const schema = suggestionSchema(true);
    const { insert, del } = aiMarks(schema, "eval-cite");
    const placeholder = "[790-00134R Rev U Solea Model 3 Software: <to be filled>]";
    const citation = "3. [report.docx, p. 1]";
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("This report covers "),
        schema.text(placeholder, [del]),
        schema.text("[3]", [insert]),
        schema.text(" for Solea Model 3."),
      ]),
      schema.node("paragraph", null, [schema.text("Citations:")]),
      schema.node("paragraph", null, [schema.text(citation, [insert])]),
    ]);

    const positions = positionsFor(doc, "eval-cite");
    expect(positions).toHaveLength(1);
    expect(doc.textBetween(positions[0]! - citation.length, positions[0]!)).toBe(
      citation
    );
  });

  it("keeps one widget when a multi-paragraph insert has no unmarked text between", () => {
    const schema = suggestionSchema(true);
    const { insert } = aiMarks(schema, "eval-list");
    const second = "Second line of the draft.";
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("First line of the draft.", [insert])]),
      schema.node("paragraph", null, [schema.text(second, [insert])]),
    ]);

    const positions = positionsFor(doc, "eval-list");
    expect(positions).toHaveLength(1);
    expect(doc.textBetween(positions[0]! - second.length, positions[0]!)).toBe(second);
  });
});
