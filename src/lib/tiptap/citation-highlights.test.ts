import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { Decoration } from "@tiptap/pm/view";
import {
  buildCitationDecorations,
  createCitationHighlightExtension,
  findNumericCitationMarkersInPmDoc,
} from "@/lib/tiptap/citation-highlights";

function schemaWithTable() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "inline*", group: "block" },
      text: { group: "inline" },
      table: { content: "tableRow+", group: "block", isolating: true },
      tableRow: { content: "tableCell+" },
      tableCell: { content: "block+", isolating: true },
    },
  });
}

function inlineDecorationAttrs(decoration: Decoration | undefined): {
  class?: string;
  "data-citation-number"?: string;
} {
  return (
    (decoration as Decoration & {
      type?: { attrs?: { class?: string; "data-citation-number"?: string } };
    }).type?.attrs ?? {}
  );
}

describe("citation highlight decorations", () => {
  it("decorates numeric markers in a paragraph", () => {
    const schema = schemaWithTable();
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Output met spec [1] for configuration A."),
      ]),
    ]);

    const highlights = findNumericCitationMarkersInPmDoc(doc);
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.number).toBe(1);
    expect(doc.textBetween(highlights[0]!.fromPos, highlights[0]!.toPos)).toBe(
      "[1]"
    );

    const decos = buildCitationDecorations(doc, highlights);
    const deco = decos.find(highlights[0]!.fromPos, highlights[0]!.toPos)[0];
    expect(inlineDecorationAttrs(deco).class).toBe("citation-ref");
    expect(inlineDecorationAttrs(deco)["data-citation-number"]).toBe("1");
  });

  it("decorates numeric markers inside table cells", () => {
    const schema = schemaWithTable();
    const doc = schema.node("doc", null, [
      schema.node("table", null, [
        schema.node("tableRow", null, [
          schema.node("tableCell", null, [
            schema.node("paragraph", null, [schema.text("Pass [2]")]),
          ]),
        ]),
      ]),
    ]);

    const highlights = findNumericCitationMarkersInPmDoc(doc);
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.number).toBe(2);
    expect(doc.textBetween(highlights[0]!.fromPos, highlights[0]!.toPos)).toBe(
      "[2]"
    );
  });

  it("skips placeholders and source citations", () => {
    const schema = schemaWithTable();
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text(
          "Use [batch number] and [protocol.pdf, p. 3] then marker [3]."
        ),
      ]),
    ]);

    const highlights = findNumericCitationMarkersInPmDoc(doc);
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.number).toBe(3);
  });

  it("finds no bubbles for non-Convergent inline source citations", () => {
    const schema = schemaWithTable();
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Output met spec [protocol.pdf, p. 3] for configuration A."),
      ]),
    ]);
    expect(findNumericCitationMarkersInPmDoc(doc)).toEqual([]);
    expect(createCitationHighlightExtension().name).toBe("citationHighlights");
  });

  it("remaps decorations across a mapping-only transaction", () => {
    const schema = schemaWithTable();
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Met spec [1].")]),
    ]);
    const highlights = findNumericCitationMarkersInPmDoc(doc);
    const decos = buildCitationDecorations(doc, highlights);
    const tr = new Transform(doc).insert(1, schema.text("X"));
    const mapped = decos.map(tr.mapping, tr.doc);
    const moved = mapped.find(highlights[0]!.fromPos + 1, highlights[0]!.toPos + 1);
    expect(moved).toHaveLength(1);
    expect(inlineDecorationAttrs(moved[0]).class).toBe("citation-ref");
  });
});
