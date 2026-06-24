import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { findPlaceholdersInPmDoc } from "@/lib/placeholders/find";

/**
 * Regression: inline placeholder fill in rich sections placed the typed value at the
 * END of the text instead of replacing the `[... <to be filled>]` token when the token
 * lived inside a container block (list item, blockquote, table cell).
 *
 * Root cause: findPlaceholdersInPmDoc stopped descending after scanning a container
 * block, so the inner paragraph holding the token was never scanned -> no highlight ->
 * the click selected nothing and typing appended at the cursor.
 *
 * The inline flow is: findPlaceholdersInPmDoc() computes the span, the click handler
 * selects [fromPos,toPos], then native typing replaces it. We drive the REAL finder and
 * replicate the selection + replace via ProseMirror state (no DOM needed).
 */

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    blockquote: { content: "block+", group: "block" },
    bulletList: { content: "listItem+", group: "block" },
    listItem: { content: "block+" },
    table: { content: "tableRow+", group: "block" },
    tableRow: { content: "tableCell+" },
    tableCell: { content: "block+" },
    image: {
      inline: true,
      group: "inline",
      attrs: { src: { default: "" } },
      toDOM: (n) => ["img", { src: (n.attrs as { src: string }).src }],
    },
    text: { group: "inline" },
  },
  marks: {
    bold: { toDOM: () => ["strong", 0] },
  },
});

const TOKEN = "[Impacted batches/materials: <to be filled>]";

/** Replicate handleClick (select span) + native type-replace; return flattened text. */
function simulateInlineFill(
  doc: ReturnType<typeof schema.node>,
  fromPos: number,
  toPos: number,
  value: string
): string {
  let state = EditorState.create({ doc });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, fromPos, toPos))
  );
  state = state.apply(state.tr.insertText(value));
  return state.doc.textBetween(0, state.doc.content.size, " ");
}

function expectInlineFillWorks(doc: ReturnType<typeof schema.node>) {
  const p = findPlaceholdersInPmDoc(doc, "define", "narrative").find(
    (x) => x.text === TOKEN
  );
  expect(p).toBeDefined();
  expect(doc.textBetween(p!.fromPos, p!.toPos)).toBe(TOKEN);

  const result = simulateInlineFill(doc, p!.fromPos, p!.toPos, "Batch 42");
  expect(result).toContain("Batch 42");
  expect(result).not.toContain("to be filled");
}

describe("inline placeholder fill — findPlaceholdersInPmDoc across block structures", () => {
  it("top-level paragraph (token mid-text)", () => {
    expectInlineFillWorks(
      schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.text("Scope is "),
          schema.text(TOKEN),
          schema.text(" overall."),
        ]),
      ])
    );
  });

  it("token split across marked text nodes", () => {
    const bold = schema.marks.bold!.create();
    expectInlineFillWorks(
      schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.text("Scope "),
          schema.text("[Impacted batches/materials: ", []),
          schema.text("<to be filled>", [bold]),
          schema.text("]"),
          schema.text(" reviewed."),
        ]),
      ])
    );
  });

  it("preceding inline image in the same paragraph", () => {
    expectInlineFillWorks(
      schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.text("See figure "),
          schema.node("image", { src: "x" }),
          schema.text(" then scope "),
          schema.text(TOKEN),
          schema.text(" end."),
        ]),
      ])
    );
  });

  it("token nested inside a list item", () => {
    expectInlineFillWorks(
      schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("Affected scope:")]),
        schema.node("bulletList", null, [
          schema.node("listItem", null, [
            schema.node("paragraph", null, [
              schema.text("Materials "),
              schema.text(TOKEN),
              schema.text("."),
            ]),
          ]),
        ]),
      ])
    );
  });

  it("token nested inside a blockquote", () => {
    expectInlineFillWorks(
      schema.node("doc", null, [
        schema.node("blockquote", null, [
          schema.node("paragraph", null, [
            schema.text("Quoted scope "),
            schema.text(TOKEN),
            schema.text("."),
          ]),
        ]),
      ])
    );
  });

  it("token nested inside a table cell", () => {
    expectInlineFillWorks(
      schema.node("doc", null, [
        schema.node("table", null, [
          schema.node("tableRow", null, [
            schema.node("tableCell", null, [
              schema.node("paragraph", null, [
                schema.text("Cell scope "),
                schema.text(TOKEN),
                schema.text("."),
              ]),
            ]),
          ]),
        ]),
      ])
    );
  });
});
