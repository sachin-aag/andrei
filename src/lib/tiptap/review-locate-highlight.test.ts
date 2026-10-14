import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { Decoration } from "@tiptap/pm/view";
import {
  REVIEW_LOCATE_CLASS,
  buildReviewLocateDecorations,
  findNeedleRangeInPmDoc,
} from "./review-locate-highlight";

const testSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    text: { group: "inline" },
  },
  marks: {},
});

function inlineClass(decoration: Decoration | undefined): string | undefined {
  return (
    decoration as Decoration & { type?: { attrs?: { class?: string } } }
  ).type?.attrs?.class;
}

describe("findNeedleRangeInPmDoc", () => {
  it("highlights one phrase inside a paragraph", () => {
    const doc = testSchema.node("doc", null, [
      testSchema.node("paragraph", null, [
        testSchema.text(
          'TM-02 passes if readings are "acceptable to the R&D Engineer".'
        ),
      ]),
    ]);
    const range = findNeedleRangeInPmDoc(doc, "acceptable to the R&D Engineer");
    expect(range).not.toBeNull();
    expect(doc.textBetween(range!.from, range!.to)).toBe(
      "acceptable to the R&D Engineer"
    );
    const decos = buildReviewLocateDecorations(
      doc,
      "acceptable to the R&D Engineer"
    );
    expect(inlineClass(decos.find()[0])).toBe(REVIEW_LOCATE_CLASS);
  });

  it("does not highlight a phrase split across paragraphs", () => {
    const doc = testSchema.node("doc", null, [
      testSchema.node("paragraph", null, [testSchema.text("acceptable to")]),
      testSchema.node("paragraph", null, [testSchema.text("the R&D Engineer")]),
    ]);
    expect(
      findNeedleRangeInPmDoc(doc, "acceptable to the R&D Engineer")
    ).toBeNull();
  });
});
