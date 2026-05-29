import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { findPlaceholdersInPmDoc } from "@/lib/placeholders/find";
import {
  buildPlaceholderDecorations,
  rangeOverlapsPendingSuggestionMarks,
} from "@/lib/tiptap/placeholder-highlights";
import { suggestionInsertMarkName } from "@/lib/tiptap/suggestion-marks";

function schemaWithSuggestionMarks() {
  return new Schema({
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
}

describe("buildPlaceholderDecorations", () => {
  it("decorates bracket placeholders inside pending AI suggestion inserts", () => {
    const schema = schemaWithSuggestionMarks();
    const insert = schema.marks.suggestionInsert!.create({
      id: "eval-1",
      authorId: "ai",
      status: "pending",
      createdAt: "",
      kind: "fix",
    });

    const prefix =
      "The initial scope of impact regarding other batches or materials is ";
    const placeholder = "[Impacted batches/materials: <to be filled>]";
    const suffix = ".";

    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text(prefix, [insert]),
        schema.text(placeholder, [insert]),
        schema.text(suffix, [insert]),
      ]),
    ]);

    const placeholders = findPlaceholdersInPmDoc(doc, "define", "narrative");
    const bracket = placeholders.find((p) => p.text === placeholder);
    expect(bracket).toBeDefined();

    expect(
      rangeOverlapsPendingSuggestionMarks(
        doc,
        bracket!.fromPos,
        bracket!.toPos
      )
    ).toBe(true);

    const slice = doc.textBetween(bracket!.fromPos, bracket!.toPos);
    expect(slice).toBe(placeholder);

    const decos = buildPlaceholderDecorations(doc, placeholders);
    expect(decos.find(bracket!.fromPos, bracket!.toPos).length).toBeGreaterThan(
      0
    );
  });
});
