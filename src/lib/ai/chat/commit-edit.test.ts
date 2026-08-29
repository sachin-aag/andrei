import { describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { applyCommitToSectionContent } from "@/lib/ai/chat/commit-edit";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";

vi.mock("@/db", () => ({ db: {} }));

function paraDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

describe("applyCommitToSectionContent", () => {
  it("applies two sequential located edits to the same rich field", () => {
    const first = applyCommitToSectionContent({
      content: {
        narrative: paraDoc(
          "The assay failed due to temperature drift on line 2."
        ),
      },
      section: "define",
      targetField: "narrative",
      documentType: "investigation_report",
      input: {
        kind: "located",
        edit: {
          anchorText: "temperature drift",
          deleteText: "temperature drift",
          insertText: "humidity excursion",
        },
      },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const afterFirst = flattenForAnchor(
      getRichFieldValue(first.content, "narrative")
    ).text;
    expect(afterFirst).toContain("humidity excursion");
    expect(afterFirst).not.toContain("temperature drift");

    const second = applyCommitToSectionContent({
      content: first.content,
      section: "define",
      targetField: "narrative",
      documentType: "investigation_report",
      input: {
        kind: "located",
        edit: {
          anchorText: "humidity excursion",
          deleteText: "humidity excursion",
          insertText: "pressure drop",
        },
      },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const afterSecond = flattenForAnchor(
      getRichFieldValue(second.content, "narrative")
    ).text;
    expect(afterSecond).toContain("pressure drop");
    expect(afterSecond).not.toContain("humidity");
    expect(afterSecond).not.toContain("temperature");
  });

  it("commits generic_document rich edits without leftover suggestion marks", () => {
    const result = applyCommitToSectionContent({
      content: { narrative: paraDoc("The protocol is complete.") },
      section: "body",
      targetField: "narrative",
      documentType: "generic_document",
      input: {
        kind: "located",
        edit: {
          anchorText: "complete",
          deleteText: "complete",
          insertText: "approved",
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const json = JSON.stringify(result.content);
    expect(json).not.toContain("suggestionInsert");
    expect(json).not.toContain("suggestionDelete");
    expect(
      flattenForAnchor(getRichFieldValue(result.content, "narrative")).text
    ).toContain("approved");
  });
});
