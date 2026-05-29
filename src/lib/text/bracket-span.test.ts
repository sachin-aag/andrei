import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import {
  clipBracketPlaceholderText,
  extendPosPastOpenBracketClose,
} from "@/lib/text/bracket-span";

describe("clipBracketPlaceholderText", () => {
  it("stops at the first balanced closing bracket", () => {
    expect(
      clipBracketPlaceholderText(
        "[Time of detection: <to be filled>] trailing"
      )
    ).toBe("[Time of detection: <to be filled>]");
  });
});

describe("extendPosPastOpenBracketClose", () => {
  it("moves past ] when the insert mark ends before the bracket closes", () => {
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
      id: "eval-1",
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
    const pastBracket = extendPosPastOpenBracketClose(doc, insertEnd);
    expect(pastBracket).toBe(1 + prefix.length + 1);
    expect(doc.textBetween(pastBracket - 1, pastBracket)).toBe("]");
  });
});
