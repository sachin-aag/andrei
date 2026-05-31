import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { Decoration } from "@tiptap/pm/view";
import { findPlaceholdersInPmDoc } from "@/lib/placeholders/find";
import {
  buildPlaceholderDecorations,
  rangeOverlapsPendingSuggestionMarks,
} from "@/lib/tiptap/placeholder-highlights";

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

/** Inline decoration classes are stored on an internal field not exposed in .d.ts. */
function inlineDecorationClass(decoration: Decoration | undefined): string | undefined {
  return (
    decoration as Decoration & { type?: { attrs?: { class?: string } } }
  ).type?.attrs?.class;
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
    const unfocusedDeco = decos.find(bracket!.fromPos, bracket!.toPos)[0];
    expect(unfocusedDeco).toBeDefined();
    expect(inlineDecorationClass(unfocusedDeco)).not.toContain(
      "placeholder-todo-active"
    );

    const focused = buildPlaceholderDecorations(doc, placeholders, bracket!.id);
    const focusedDeco = focused.find(bracket!.fromPos, bracket!.toPos)[0];
    expect(inlineDecorationClass(focusedDeco)).toContain(
      "placeholder-todo-active"
    );
  });
});
