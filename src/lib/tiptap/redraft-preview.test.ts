import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { buildRedraftPreviewDoc } from "./redraft-preview";
import {
  acceptSuggestionMarksById,
  stripSuggestionMarksById,
} from "./suggestion-inject";
import { markdownToDoc } from "./markdown-to-doc";
import { richJsonToPlainText } from "./rich-text";

const ATTRS = {
  id: "redraft-1",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "redraft" as const,
};

const currentDoc: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Old purpose statement." }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Second old paragraph." }],
    },
  ],
};

describe("buildRedraftPreviewDoc", () => {
  it("marks current content as delete and replacement as insert", () => {
    const replacement = markdownToDoc("New purpose.\n\nWith details.");
    const preview = buildRedraftPreviewDoc(currentDoc, replacement, ATTRS);

    const text = richJsonToPlainText(preview);
    expect(text).toContain("Old purpose statement.");
    expect(text).toContain("New purpose.");

    // Old text carries delete marks, new text carries insert marks.
    const marksByText = new Map<string, string[]>();
    const walk = (n: JSONContent) => {
      if (n.type === "text") {
        marksByText.set(n.text ?? "", (n.marks ?? []).map((m) => m.type));
      }
      n.content?.forEach(walk);
    };
    walk(preview);
    expect(marksByText.get("Old purpose statement.")).toEqual(["suggestionDelete"]);
    expect(marksByText.get("New purpose.")).toEqual(["suggestionInsert"]);
  });

  it("shows only the replacement when the field is empty", () => {
    const empty: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
    const preview = buildRedraftPreviewDoc(empty, markdownToDoc("Fresh draft."), ATTRS);
    expect(richJsonToPlainText(preview).trim()).toBe("Fresh draft.");
  });

  it("dismiss (strip) restores the original doc exactly", () => {
    const replacement = markdownToDoc(
      "New purpose.\n\n| Batch | Result |\n| --- | --- |\n| B-1 | Pass |"
    );
    const preview = buildRedraftPreviewDoc(currentDoc, replacement, ATTRS);
    const restored = stripSuggestionMarksById(preview, ATTRS.id);
    expect(restored).toEqual(currentDoc);
  });

  it("accept yields the replacement content (old blocks fully removed)", () => {
    const replacement = markdownToDoc("New purpose.\n\n- item one\n- item two");
    const preview = buildRedraftPreviewDoc(currentDoc, replacement, ATTRS);
    const accepted = acceptSuggestionMarksById(preview, ATTRS.id);

    const text = richJsonToPlainText(accepted);
    expect(text).not.toContain("Old purpose statement.");
    expect(text).not.toContain("Second old paragraph.");
    expect(text).toContain("New purpose.");
    expect(text).toContain("item one");

    // No skeleton blocks left over from the struck-out old content.
    const blockCount = (accepted.content ?? []).length;
    expect(blockCount).toBe((replacement.content ?? []).length);
  });

  it("accept keeps tables from the replacement intact", () => {
    const replacement = markdownToDoc(
      "| Batch | Result |\n| --- | --- |\n| B-1 | Pass |"
    );
    const preview = buildRedraftPreviewDoc(currentDoc, replacement, ATTRS);
    const accepted = acceptSuggestionMarksById(preview, ATTRS.id);
    expect((accepted.content ?? []).map((b) => b.type)).toEqual(["table"]);
  });

  // Structural table change (delete a row) via whole-table redraft — the
  // sanctioned path for add/remove row/column instead of node-level edits.
  it("deletes a table row via redraft: accept keeps the smaller table, reject restores the original", () => {
    const originalTable = markdownToDoc(
      "| Test | Result |\n| --- | --- |\n| T-1 | Pass |\n| T-2 | Fail |"
    );
    const rowCount = (t: JSONContent) =>
      (t.content ?? []).find((b) => b.type === "table")?.content?.length ?? 0;
    expect(rowCount(originalTable)).toBe(3); // header + 2 data rows

    // Redraft to the same table with the T-2 row removed.
    const replacement = markdownToDoc(
      "| Test | Result |\n| --- | --- |\n| T-1 | Pass |"
    );
    const preview = buildRedraftPreviewDoc(originalTable, replacement, ATTRS);

    const accepted = acceptSuggestionMarksById(preview, ATTRS.id);
    expect((accepted.content ?? []).map((b) => b.type)).toEqual(["table"]);
    expect(rowCount(accepted)).toBe(2); // header + 1 data row
    expect(richJsonToPlainText(accepted)).not.toContain("T-2");

    const rejected = stripSuggestionMarksById(preview, ATTRS.id);
    expect(rowCount(rejected)).toBe(3);
    expect(richJsonToPlainText(rejected)).toContain("T-2");
  });
});

describe("stripSuggestionMarksById — appended paragraph cleanup", () => {
  it("drops a paragraph that exists only to hold inserted text", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Existing text." }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Appended suggestion.",
              marks: [{ type: "suggestionInsert", attrs: { ...ATTRS } }],
            },
          ],
        },
      ],
    };
    const stripped = stripSuggestionMarksById(doc, ATTRS.id);
    expect((stripped.content ?? []).length).toBe(1);
    expect(richJsonToPlainText(stripped).trim()).toBe("Existing text.");
  });

  it("keeps a block when it still has other text after stripping", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Kept. " },
            {
              type: "text",
              text: "inserted",
              marks: [{ type: "suggestionInsert", attrs: { ...ATTRS } }],
            },
          ],
        },
      ],
    };
    const stripped = stripSuggestionMarksById(doc, ATTRS.id);
    expect((stripped.content ?? []).length).toBe(1);
    expect(richJsonToPlainText(stripped).trim()).toBe("Kept.");
  });
});
