// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { TableRow } from "@tiptap/extension-table-row";
import { BulletListWithStyle } from "@/lib/tiptap/bullet-list-with-style";
import { ImageInline } from "@/lib/tiptap/image-inline";
import { MathBlock, MathInline } from "@/lib/tiptap/math-nodes";
import {
  TableCellWithVerticalAlign,
  TableHeaderWithVerticalAlign,
} from "@/lib/tiptap/table-cell-vertical-align";
import { TableWithColumnWidths } from "@/lib/tiptap/table-column-widths";
import {
  SuggestionInsert,
  SuggestionDelete,
} from "@/lib/tiptap/suggestion-marks";
import { buildRedraftPreviewDoc } from "@/lib/tiptap/redraft-preview";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import { acceptSuggestionMarksById } from "@/lib/tiptap/suggestion-inject";
import type { JSONContent } from "@tiptap/core";

/** Same node/mark schema the section editor uses (marks that matter for previews). */
function makeEditor(content: JSONContent) {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false }),
      BulletListWithStyle,
      Subscript,
      Superscript,
      TextStyle,
      Color,
      ImageInline,
      MathInline,
      MathBlock,
      TableWithColumnWidths.configure({ resizable: false }),
      TableRow,
      TableCellWithVerticalAlign,
      TableHeaderWithVerticalAlign,
      SuggestionInsert,
      SuggestionDelete,
    ],
    content,
  });
}

const REDRAFT_MD = [
  "## Deviation Description",
  "On July 8 2026, warehouse personnel identified batch [batch number] was stored between 12C and 15C.",
  "",
  "## Expected vs. Actual",
  "* **Expected:** stored at 2C to 8C.",
  "* **Actual:** exposed to 12-15C.",
].join("\n");

const ATTRS = {
  id: "redraft-1",
  authorId: "andrei",
  status: "pending" as const,
  createdAt: "2026-07-24T00:00:00.000Z",
  kind: "redraft" as const,
};

describe("redraft preview in a real editor", () => {
  it("renders the redraft as highlighted insert text when the field is empty", () => {
    const preview = buildRedraftPreviewDoc(
      emptyDoc(),
      markdownToDoc(REDRAFT_MD),
      ATTRS
    );
    const editor = makeEditor(preview);
    const html = editor.getHTML();

    // The text must actually appear (not blank).
    expect(html).toContain("Deviation Description");
    expect(html).toContain("Expected");
    // The insert marks must survive setContent (ProseMirror sanitizes invalid marks).
    expect(editor.getHTML()).toContain("suggestion-insert");
    editor.destroy();
  });

  it("accepting the preview yields the replacement content in the editor", () => {
    const preview = buildRedraftPreviewDoc(
      emptyDoc(),
      markdownToDoc(REDRAFT_MD),
      ATTRS
    );
    const accepted = acceptSuggestionMarksById(
      preview,
      ATTRS.id
    ) as JSONContent;
    const editor = makeEditor(accepted);
    const text = editor.getText();

    expect(text).toContain("Deviation Description");
    expect(text).toContain("Expected");
    // No leftover suggestion marks after accept.
    expect(editor.getHTML()).not.toContain("suggestion-insert");
    editor.destroy();
  });

  it("renders redraft preview when the field already has content", () => {
    const current = markdownToDoc("Old narrative text that will be replaced.");
    const preview = buildRedraftPreviewDoc(
      current,
      markdownToDoc(REDRAFT_MD),
      ATTRS
    );
    const editor = makeEditor(preview);
    const html = editor.getHTML();

    expect(html).toContain("Old narrative text");
    expect(html).toContain("Deviation Description");
    expect(html).toContain("suggestion-delete");
    expect(html).toContain("suggestion-insert");
    editor.destroy();
  });
});
