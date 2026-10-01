// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InsertTableRefButton } from "@/components/report/editor-toolbars";
import { TableRefNumbersContext } from "@/providers/table-ref-numbers";

function mockEditor() {
  return {
    chain() {
      return this;
    },
    focus() {
      return this;
    },
    insertTableRef() {
      return this;
    },
    run() {
      return true;
    },
  };
}

describe("InsertTableRefButton", () => {
  it("shows empty-state copy when the document has no numbered tables", async () => {
    const user = userEvent.setup();
    render(
      <TableRefNumbersContext
        value={{ map: new Map(), insertable: [], documentType: null }}
      >
        <InsertTableRefButton editor={mockEditor() as never} />
      </TableRefNumbersContext>
    );

    await user.click(screen.getByTestId("insert-table-ref-button"));
    expect(screen.getByTestId("insert-table-ref-menu")).toHaveTextContent(
      /no tables to reference yet/i
    );
    expect(screen.getByTestId("insert-table-ref-menu")).toHaveTextContent(
      /\[\[table\]\]/
    );
  });

  it("inserts the chosen Table N from the picker", async () => {
    const user = userEvent.setup();
    const insertSpy = vi.fn();
    const editor = {
      chain() {
        return this;
      },
      focus() {
        return this;
      },
      insertTableRef(attrs: unknown) {
        insertSpy(attrs);
        return this;
      },
      run() {
        return true;
      },
    };

    render(
      <TableRefNumbersContext
        value={{
          map: new Map(),
          insertable: [
            {
              n: 2,
              section: "elr_monitoring",
              targetField: "table",
              tableIndex: 0,
              title: "Monitoring records",
              sectionLabel: "Monitoring",
            },
          ],
          documentType: "equipment_lifecycle_report",
        }}
      >
        <InsertTableRefButton editor={editor as never} />
      </TableRefNumbersContext>
    );

    await user.click(screen.getByTestId("insert-table-ref-button"));
    await user.click(screen.getByText("Table 2. Monitoring records"));
    expect(insertSpy).toHaveBeenCalledWith({
      section: "elr_monitoring",
      targetField: "table",
      tableIndex: 0,
      n: 2,
    });
  });
});
