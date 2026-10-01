// @vitest-environment jsdom

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { useEditor, EditorContent } from "@tiptap/react";
import { FloatingMenu } from "@tiptap/react/menus";
import type { Editor, JSONContent } from "@tiptap/core";
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

function tableCell(
  text: string,
  type: "tableCell" | "tableHeader" = "tableCell"
): JSONContent {
  return {
    type,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const TWO_BY_TWO_TABLE_DOC: JSONContent = {
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            tableCell("A1", "tableHeader"),
            tableCell("A2", "tableHeader"),
          ],
        },
        {
          type: "tableRow",
          content: [tableCell("B1"), tableCell("B2")],
        },
      ],
    },
  ],
};

function cellPositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      positions.push(pos);
    }
  });
  return positions;
}

function tableExtensions() {
  return [
    StarterKit.configure({ heading: false, bulletList: false }),
    TableWithColumnWidths.configure({ resizable: false }),
    TableRow,
    TableCellWithVerticalAlign,
    TableHeaderWithVerticalAlign,
  ];
}

function TableMenuHarness() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: tableExtensions(),
    content: TWO_BY_TWO_TABLE_DOC,
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
    extensions: tableExtensions(),
    content: TWO_BY_TWO_TABLE_DOC,
  });

  if (!editor) return null;

  return (
    <>
      <button
        type="button"
        data-testid="select-two-cells"
        onClick={() => {
          const [anchorCell, headCell] = cellPositions(editor);
          editor.commands.setCellSelection({ anchorCell, headCell });
        }}
      >
        Select two cells
      </button>
      <TableEditToolbar editor={editor} />
    </>
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

  it("enables Merge after a two-cell selection without a parent re-render", async () => {
    render(<MergeToolbarHarness />);
    const merge = await screen.findByTestId("table-merge-cells");
    expect(merge).toBeDisabled();

    fireEvent.click(screen.getByTestId("select-two-cells"));

    await waitFor(() => {
      expect(merge).toBeEnabled();
    });
  });

  it("enables Split after merging the selected cells", async () => {
    render(<MergeToolbarHarness />);
    const merge = await screen.findByTestId("table-merge-cells");
    const split = screen.getByTestId("table-split-cell");
    expect(split).toBeDisabled();

    fireEvent.click(screen.getByTestId("select-two-cells"));
    await waitFor(() => {
      expect(merge).toBeEnabled();
    });

    fireEvent.click(merge);
    await waitFor(() => {
      expect(split).toBeEnabled();
      expect(merge).toBeDisabled();
    });
  });
});
