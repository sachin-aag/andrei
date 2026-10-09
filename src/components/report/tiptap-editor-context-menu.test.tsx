// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TiptapEditorContextMenu } from "@/components/report/tiptap-editor-context-menu";
import { TableRefNumbersContext } from "@/providers/table-ref-numbers";

vi.mock("@/lib/statistical-analysis/client", () => ({
  getReportAnalytics: vi.fn(async () => ({ analyses: [] })),
  fetchAnalysisImage: vi.fn(),
}));

function mockEditor() {
  return {
    state: { selection: { from: 1, to: 1 } },
  };
}

function manyInsertableTables(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    n: index + 1,
    section: "cvp_cleaning_results",
    targetField: "table",
    tableIndex: index,
    title: `Maximum Allowable Carryover ${index + 1}`,
    sectionLabel: "Cleaning Results Summary",
  }));
}

describe("TiptapEditorContextMenu table references", () => {
  it("keeps the table-reference submenu scrollable when many tables exist", async () => {
    const user = userEvent.setup();
    render(
      <TableRefNumbersContext
        value={{
          map: new Map(),
          insertable: manyInsertableTables(18),
          documentType: "cleaning_verification_protocol",
        }}
      >
        <TiptapEditorContextMenu
          editor={mockEditor() as never}
          editable
          reportId="rep-1"
        >
          <div data-testid="editor-surface">Editor</div>
        </TiptapEditorContextMenu>
      </TableRefNumbersContext>
    );

    fireEvent.contextMenu(screen.getByTestId("editor-surface"));
    await user.hover(screen.getByTestId("tiptap-context-insert-table-ref"));

    const list = await screen.findByTestId("tiptap-context-table-ref-list");
    expect(list).toHaveClass("overflow-y-auto");
    expect(list.className).toMatch(/max-h-\[min\(18rem/);
    expect(list).toHaveTextContent("Table 1. Maximum Allowable Carryover 1");
    expect(list).toHaveTextContent("Table 18. Maximum Allowable Carryover 18");
  });
});
