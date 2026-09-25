// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { TableRow } from "@tiptap/extension-table-row";
import { BulletListWithStyle } from "@/lib/tiptap/bullet-list-with-style";
import { ImageInline } from "@/lib/tiptap/image-inline";
import { MathBlock, MathInline } from "@/lib/tiptap/math-nodes";
import { TableRef } from "@/lib/tiptap/table-ref";
import {
  TableCellWithVerticalAlign,
  TableHeaderWithVerticalAlign,
} from "@/lib/tiptap/table-cell-vertical-align";
import { TableWithColumnWidths } from "@/lib/tiptap/table-column-widths";
import {
  SuggestionInsert,
  SuggestionDelete,
} from "@/lib/tiptap/suggestion-marks";
import { collectSuggestionActionWidgetPositions } from "@/lib/tiptap/suggestion-action-widgets";
import {
  narrativeHasSuggestionMarks,
} from "@/lib/suggestions/apply-narrative-suggestion";
import { buildTableOperationPreviewDoc } from "@/lib/suggestions/table-preview";

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
      TableRef,
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

function textCell(
  type: "tableHeader" | "tableCell",
  text: string
): JSONContent {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : undefined,
      },
    ],
  };
}

function tableDoc(headers: string[], rows: string[][]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: headers.map((h) => textCell("tableHeader", h)),
          },
          ...rows.map((row) => ({
            type: "tableRow" as const,
            content: row.map((c) => textCell("tableCell", c)),
          })),
        ],
      },
    ],
  };
}

const ATTRS = {
  id: "table-sug-1",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-09-25T00:00:00.000Z",
  kind: "fix" as const,
};

describe("table operation preview in a real editor", () => {
  it("keeps insert-row suggestion marks after setContent", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(["Document", "No."], [["URS", "QAD-001"]]),
      {
        kind: "insert_rows",
        tableIndex: 0,
        afterRow: 0,
        rows: [["IQ protocol", "QAD-016"]],
      },
      ATTRS
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const editor = makeEditor(preview.doc);
    const html = editor.getHTML();
    expect(html).toContain("IQ protocol");
    expect(html).toContain("suggestion-insert");
    expect(narrativeHasSuggestionMarks(editor.getJSON(), ATTRS.id)).toBe(true);

    const widgets = collectSuggestionActionWidgetPositions(
      editor.state.doc,
      new Set([ATTRS.id])
    );
    expect(widgets).toHaveLength(1);
    const firstInsert = html.indexOf("IQ protocol");
    const lastInsert = html.lastIndexOf("QAD-016");
    expect(firstInsert).toBeGreaterThan(-1);
    expect(lastInsert).toBeGreaterThan(firstInsert);
    editor.destroy();
  });

  it("keeps edit-cell insert and delete marks after setContent", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(["Document", "No."], [["URS", "QAD-001"]]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "User Requirement Spec" }],
      },
      ATTRS
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const editor = makeEditor(preview.doc);
    const html = editor.getHTML();
    expect(html).toContain("suggestion-insert");
    expect(html).toContain("suggestion-delete");
    expect(html).toContain("Requirement Spec");
    expect(collectSuggestionActionWidgetPositions(
      editor.state.doc,
      new Set([ATTRS.id])
    )).toHaveLength(1);
    editor.destroy();
  });
});
