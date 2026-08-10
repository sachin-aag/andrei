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
import { SuggestionInsert, SuggestionDelete } from "@/lib/tiptap/suggestion-marks";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import type { JSONContent } from "@tiptap/core";
import { injectBlockEditMarks, applyBlockEdit } from "./block-redraft";

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

const ATTRS = {
  id: "block-1",
  authorId: "andrei",
  status: "pending" as const,
  createdAt: "2026-08-11T00:00:00.000Z",
  kind: "redraft" as const,
};

const CURRENT = "Keep this intro paragraph.\n\nOld middle paragraph.\n\nKeep this closing paragraph.";

describe("block-edit preview in a real editor", () => {
  it("replace shows the old block struck and the new block inserted; neighbours stay", () => {
    const doc = markdownToDoc(CURRENT);
    const { status, doc: preview } = injectBlockEditMarks(
      doc,
      { op: "replace", anchor: "Old middle paragraph.", blockIndex: 1, proposedMarkdown: "Brand new middle." },
      ATTRS
    );
    expect(status).toBe("located");
    const editor = makeEditor(preview);
    const html = editor.getHTML();
    expect(html).toContain("suggestion-delete"); // old middle struck
    expect(html).toContain("suggestion-insert"); // new middle highlighted
    expect(html).toContain("Keep this intro paragraph.");
    expect(html).toContain("Keep this closing paragraph.");
    editor.destroy();
  });

  it("accepting a replace yields merged content in the editor with no leftover marks", () => {
    const doc = markdownToDoc(CURRENT);
    const { doc: accepted } = applyBlockEdit(doc, ATTRS.id, {
      op: "replace",
      anchor: "Old middle paragraph.",
      blockIndex: 1,
      proposedMarkdown: "Brand new middle.",
    });
    const editor = makeEditor(accepted);
    const text = editor.getText();
    expect(text).toContain("Keep this intro paragraph.");
    expect(text).toContain("Brand new middle.");
    expect(text).toContain("Keep this closing paragraph.");
    expect(text).not.toContain("Old middle paragraph.");
    expect(editor.getHTML()).not.toContain("suggestion-insert");
    expect(editor.getHTML()).not.toContain("suggestion-delete");
    editor.destroy();
  });

  it("insert (empty field first draft) renders the new block as highlighted insert", () => {
    const { doc: preview } = injectBlockEditMarks(
      markdownToDoc(""),
      { op: "insert", anchor: "", blockIndex: -1, proposedMarkdown: "The first drafted paragraph." },
      ATTRS
    );
    const editor = makeEditor(preview);
    expect(editor.getHTML()).toContain("suggestion-insert");
    expect(editor.getText()).toContain("The first drafted paragraph.");
    editor.destroy();
  });

  it("deleteRow preview strikes the target row; accept drops it", () => {
    const tableMd =
      "| Action | Due |\n| --- | --- |\n| PA-01 | 30/04/2026 |\n| PA-02 | 30/04/2026 |";
    const op = {
      op: "deleteRow" as const,
      anchor: "",
      blockIndex: 0,
      tableIndex: 0,
      rowIndex: 2,
      rowAnchor: "PA-02",
    };
    const { status, doc: preview } = injectBlockEditMarks(markdownToDoc(tableMd), op, ATTRS);
    expect(status).toBe("located");
    const previewEditor = makeEditor(preview);
    expect(previewEditor.getHTML()).toContain("suggestion-delete");
    expect(previewEditor.getText()).toContain("PA-02");
    previewEditor.destroy();

    const { doc: accepted } = applyBlockEdit(markdownToDoc(tableMd), ATTRS.id, op);
    const editor = makeEditor(accepted);
    expect(editor.getText()).toContain("PA-01");
    expect(editor.getText()).not.toContain("PA-02");
    expect(editor.getHTML()).not.toContain("suggestion-delete");
    editor.destroy();
  });

  it("high-overlap replace preview is a unified word diff, not strike-all + insert-all", () => {
    const old =
      "During visual inspection of batch B1234 white particles were observed on the stopper.";
    const neu =
      "During visual inspection of batch B1234, white particles were observed on the stopper and recorded.";
    const { status, doc: preview } = injectBlockEditMarks(
      markdownToDoc(old),
      { op: "replace", anchor: old, blockIndex: 0, proposedMarkdown: neu },
      ATTRS
    );
    expect(status).toBe("located");
    const editor = makeEditor(preview);
    const text = editor.getText();
    expect((text.match(/batch B1234/g) ?? []).length).toBe(1);
    expect((text.match(/visual inspection/g) ?? []).length).toBe(1);
    expect(editor.getHTML()).toContain("suggestion-insert");
    editor.destroy();
  });

  it("insertRow preview highlights the new row", () => {
    const tableMd = "| Action | Due |\n| --- | --- |\n| PA-01 | 30/04/2026 |";
    const { status, doc: preview } = injectBlockEditMarks(
      markdownToDoc(tableMd),
      {
        op: "insertRow",
        anchor: "",
        blockIndex: 0,
        tableIndex: 0,
        rowIndex: 1,
        rowAnchor: "PA-01",
        proposedMarkdown: "| Action | Due |\n| --- | --- |\n| PA-02 | 15/06/2026 |",
      },
      ATTRS
    );
    expect(status).toBe("located");
    const editor = makeEditor(preview);
    expect(editor.getHTML()).toContain("suggestion-insert");
    expect(editor.getText()).toContain("PA-02");
    editor.destroy();
  });
});
