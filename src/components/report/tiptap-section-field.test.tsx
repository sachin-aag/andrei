// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { useEditor, EditorContent } from "@tiptap/react";
import { FloatingMenu } from "@tiptap/react/menus";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableRow } from "@tiptap/extension-table-row";
import {
  TableCellWithVerticalAlign,
  TableHeaderWithVerticalAlign,
} from "@/lib/tiptap/table-cell-vertical-align";
import { TableWithColumnWidths } from "@/lib/tiptap/table-column-widths";
import { TableEditToolbar } from "@/components/report/tiptap-section-field";

beforeAll(() => {
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
  const emptyRect: DOMRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  };
  Range.prototype.getBoundingClientRect = () => emptyRect;
  Range.prototype.getClientRects = () =>
    ({
      item: () => null,
      length: 0,
      [Symbol.iterator]: function* () {},
    }) as DOMRectList;
  Element.prototype.getClientRects = () =>
    ({
      item: () => null,
      length: 0,
      [Symbol.iterator]: function* () {},
    }) as DOMRectList;
  Element.prototype.getBoundingClientRect = () => emptyRect;
});

const TABLE_ONLY_DOC: JSONContent = {
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Col" }] },
              ],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "cell" }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function TableMenuHarness() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false }),
      TableWithColumnWidths.configure({ resizable: false }),
      TableRow,
      TableCellWithVerticalAlign,
      TableHeaderWithVerticalAlign,
    ],
    content: TABLE_ONLY_DOC,
  });

  if (!editor) return null;

  return (
    <div data-canvas-pane="active" className="absolute inset-0 z-10">
      <EditorContent editor={editor} />
      <FloatingMenu
        editor={editor}
        appendTo={() => document.body}
        className="z-50"
        shouldShow={({ editor: ed }) => ed.isActive("table")}
      >
        <div data-testid="table-edit-toolbar">Table</div>
      </FloatingMenu>
    </div>
  );
}

function MergeToolbarHarness() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false }),
      TableWithColumnWidths.configure({ resizable: false }),
      TableRow,
      TableCellWithVerticalAlign,
      TableHeaderWithVerticalAlign,
    ],
    content: TABLE_ONLY_DOC,
  });

  if (!editor) return null;
  return (
    <TableEditToolbar editor={editor} tableHAlign={null} tableVAlign={null} />
  );
}

describe("table edit floating menu stacking", () => {
  it("portals the menu onto document.body with z-50, outside the z-10 canvas", async () => {
    render(<TableMenuHarness />);

    const toolbar = await screen.findByTestId("table-edit-toolbar");
    await waitFor(() => {
      expect(toolbar.parentElement).toHaveClass("z-50");
    });
    expect(document.body.contains(toolbar)).toBe(true);
    expect(toolbar.closest("[data-canvas-pane]")).toBeNull();
  });

  it("offers Merge and Split on the shared table toolbar", async () => {
    render(<MergeToolbarHarness />);
    const merge = await screen.findByTestId("table-merge-cells");
    expect(merge).toHaveTextContent("Merge");
    expect(merge).toHaveAttribute("title", "Merge selected cells");
    const split = screen.getByTestId("table-split-cell");
    expect(split).toHaveTextContent("Split");
    expect(split).toHaveAttribute("title", "Split merged cell");
  });
});
