import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { Decoration } from "@tiptap/pm/view";
import {
  buildCitationDecorations,
  createCitationHighlightExtension,
  findCitationHighlightsInPmDoc,
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
  "data-citation-open"?: string;
} {
  return (
    (decoration as Decoration & {
      type?: {
        attrs?: {
          class?: string;
          "data-citation-number"?: string;
          "data-citation-open"?: string;
        };
      };
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

  it("skips placeholders when finding numeric markers", () => {
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

  it("makes inline source citations clickable", () => {
    const schema = schemaWithTable();
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Output met spec [protocol.pdf, p. 3] for configuration A."),
      ]),
    ]);
    expect(findNumericCitationMarkersInPmDoc(doc)).toEqual([]);
    const highlights = findCitationHighlightsInPmDoc(doc);
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.kind).toBe("source");
    expect(highlights[0]?.openRaw).toBe("[protocol.pdf, p. 3]");

    const decos = buildCitationDecorations(doc, highlights);
    const deco = decos.find(highlights[0]!.fromPos, highlights[0]!.toPos)[0];
    expect(inlineDecorationAttrs(deco).class).toBe("citation-source");
    expect(inlineDecorationAttrs(deco)["data-citation-open"]).toBe(
      "[protocol.pdf, p. 3]"
    );
    expect(createCitationHighlightExtension().name).toBe("citationHighlights");
  });

  it("resolves numbered markers from the trailing Citations list", () => {
    const schema = schemaWithTable();
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Output met spec [1] for configuration A."),
      ]),
      schema.node("paragraph", null, [schema.text("Citations:")]),
      schema.node("paragraph", null, [schema.text("1. [protocol.pdf, p. 3]")]),
    ]);

    const highlights = findCitationHighlightsInPmDoc(doc);
    const numeric = highlights.find((h) => h.kind === "numeric");
    const source = highlights.find((h) => h.kind === "source");
    expect(numeric?.openRaw).toBe("[protocol.pdf, p. 3]");
    expect(source?.openRaw).toBe("[protocol.pdf, p. 3]");
  });

  it("splits two files in one bracket into two clickable spans", () => {
    const schema = schemaWithTable();
    const cite =
      "[RTM for E-PR-068,.pdf, p. 100, CSV-RTM-PR-053.pdf, p. 5]";
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text(`Traceability ${cite}.`),
      ]),
    ]);
    const highlights = findCitationHighlightsInPmDoc(doc).filter(
      (h) => h.kind === "source"
    );
    expect(highlights).toHaveLength(2);
    expect(highlights[0]?.openRaw).toBe("[RTM for E-PR-068,.pdf, p. 100]");
    expect(highlights[1]?.openRaw).toBe("[CSV-RTM-PR-053.pdf, p. 5]");
    expect(
      doc.textBetween(highlights[0]!.fromPos, highlights[0]!.toPos)
    ).toBe("RTM for E-PR-068,.pdf, p. 100");
    expect(
      doc.textBetween(highlights[1]!.fromPos, highlights[1]!.toPos)
    ).toBe("CSV-RTM-PR-053.pdf, p. 5");
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
