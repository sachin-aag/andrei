import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { Decoration } from "@tiptap/pm/view";
import {
  REVIEW_LOCATE_BLOCK_CLASS,
  REVIEW_LOCATE_CLASS,
  buildReviewLocateDecorations,
  findReviewLocateRangeInPmDoc,
} from "./review-locate-highlight";

const testSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    text: { group: "inline" },
  },
  marks: {},
});

function decorationClass(decoration: Decoration | undefined): string | undefined {
  return (
    decoration as Decoration & { type?: { attrs?: { class?: string } } }
  ).type?.attrs?.class;
}

function paragraphs(...texts: string[]) {
  return testSchema.node(
    "doc",
    null,
    texts.map((text) =>
      testSchema.node("paragraph", null, text ? [testSchema.text(text)] : [])
    )
  );
}

describe("findReviewLocateRangeInPmDoc", () => {
  it("highlights one phrase inside a paragraph", () => {
    const doc = paragraphs(
      'TM-02 passes if readings are "acceptable to the R&D Engineer".'
    );
    const target = { anchor: "", needle: "acceptable to the R&D Engineer" };
    const range = findReviewLocateRangeInPmDoc(doc, target);
    expect(range).not.toBeNull();
    expect(doc.textBetween(range!.from, range!.to)).toBe(
      "acceptable to the R&D Engineer"
    );
    const decos = buildReviewLocateDecorations(doc, target);
    expect(decorationClass(decos.find()[0])).toBe(REVIEW_LOCATE_CLASS);
  });

  it("paints the repeated word inside its unique anchor", () => {
    const doc = paragraphs(
      "Pre-requisites",
      "All Pre-requisites must be met before sampling."
    );
    const range = findReviewLocateRangeInPmDoc(doc, {
      anchor: "All Pre-requisites must be met",
      needle: "Pre-requisites",
    });
    expect(range).not.toBeNull();
    expect(doc.textBetween(range!.from, range!.to)).toBe("Pre-requisites");
    expect(range!.from).toBeGreaterThan(doc.child(0).nodeSize);
  });

  it("does not highlight a phrase split across paragraphs", () => {
    const doc = paragraphs("acceptable to", "the R&D Engineer");
    expect(
      findReviewLocateRangeInPmDoc(doc, {
        anchor: "",
        needle: "acceptable to the R&D Engineer",
      })
    ).toBeNull();
  });
});

describe("buildReviewLocateDecorations", () => {
  it("tints every block when the target is the whole field", () => {
    const doc = paragraphs("One.", "Two.");
    const decos = buildReviewLocateDecorations(doc, { anchor: "", needle: "" });
    const found = decos.find();
    expect(found).toHaveLength(2);
    expect(found.every((d) => decorationClass(d) === REVIEW_LOCATE_BLOCK_CLASS)).toBe(
      true
    );
  });

  it("falls back to the whole field when the text no longer locates", () => {
    const doc = paragraphs("The wording was edited since the check.");
    const decos = buildReviewLocateDecorations(doc, {
      anchor: "",
      needle: "acceptable to the R&D Engineer",
    });
    expect(decorationClass(decos.find()[0])).toBe(REVIEW_LOCATE_BLOCK_CLASS);
  });

  it("paints nothing without a target", () => {
    expect(buildReviewLocateDecorations(paragraphs("Text."), null).find()).toHaveLength(0);
  });
});
