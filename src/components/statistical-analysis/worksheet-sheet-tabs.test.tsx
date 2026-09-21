// @vitest-environment jsdom

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  addDataSheet,
  createEmptyWorksheet,
  deleteDataSheet,
  renameDataSheet,
  switchWorksheetTab,
} from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";
import { PRIMARY_DATA_SHEET_ID } from "@/lib/statistical-analysis/types";
import { WorksheetSheetTabs } from "./worksheet-sheet-tabs";

function TabsHarness({
  initial = createEmptyWorksheet(),
  readOnly = false,
}: {
  initial?: WorksheetData;
  readOnly?: boolean;
}) {
  const [worksheet, setWorksheet] = useState(initial);
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [sheetNameDraft, setSheetNameDraft] = useState("");

  return (
    <WorksheetSheetTabs
      worksheet={worksheet}
      readOnly={readOnly}
      editingSheetId={editingSheetId}
      sheetNameDraft={sheetNameDraft}
      onSheetNameDraftChange={setSheetNameDraft}
      onBeginRename={(sheetId) => {
        const sheet = worksheet.sheets.find((item) => item.id === sheetId);
        if (!sheet || readOnly) return;
        setEditingSheetId(sheetId);
        setSheetNameDraft(sheet.name);
      }}
      onCommitRename={() => {
        if (editingSheetId === null) return;
        setWorksheet((current) =>
          renameDataSheet(current, editingSheetId, sheetNameDraft)
        );
        setEditingSheetId(null);
      }}
      onCancelRename={() => setEditingSheetId(null)}
      onActivate={(sheetId) => {
        setWorksheet((current) =>
          current.activeSheetId === sheetId
            ? current
            : switchWorksheetTab(current, sheetId)
        );
      }}
      onDelete={(sheetId) => {
        setWorksheet((current) => deleteDataSheet(current, sheetId));
      }}
    />
  );
}

async function openSheetMenu(
  user: ReturnType<typeof userEvent.setup>,
  sheetId: string
) {
  await user.pointer({
    keys: "[MouseRight]",
    target: screen.getByTestId(`worksheet-sheet-tab-${sheetId}`),
  });
}

describe("WorksheetSheetTabs", () => {
  it("renames a sheet from the right-click menu", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);

    await openSheetMenu(user, PRIMARY_DATA_SHEET_ID);
    expect(
      screen.getByTestId(`worksheet-sheet-menu-delete-${PRIMARY_DATA_SHEET_ID}`)
    ).toHaveAttribute("data-disabled");
    await user.click(
      screen.getByTestId(`worksheet-sheet-menu-rename-${PRIMARY_DATA_SHEET_ID}`)
    );

    const input = screen.getByTestId(
      `worksheet-sheet-rename-${PRIMARY_DATA_SHEET_ID}`
    );
    expect(input).toHaveValue("Data");
    await user.clear(input);
    await user.type(input, "Assay{Enter}");
    expect(
      screen.getByTestId(`worksheet-sheet-tab-${PRIMARY_DATA_SHEET_ID}`)
    ).toHaveTextContent("Assay");
  });

  it("deletes the sheet that was right-clicked", async () => {
    const user = userEvent.setup();
    render(<TabsHarness initial={addDataSheet(createEmptyWorksheet(), "Assay")} />);

    await openSheetMenu(user, "data-2");
    const deleteItem = screen.getByTestId("worksheet-sheet-menu-delete-data-2");
    expect(deleteItem).not.toHaveAttribute("data-disabled");
    await user.click(deleteItem);

    expect(screen.queryByTestId("worksheet-sheet-tab-data-2")).toBeNull();
    expect(
      screen.getByTestId(`worksheet-sheet-tab-${PRIMARY_DATA_SHEET_ID}`)
    ).toHaveTextContent("Data");
  });

  it("does not open a menu on a read-only sheet tab", async () => {
    const user = userEvent.setup();
    render(<TabsHarness readOnly />);

    await openSheetMenu(user, PRIMARY_DATA_SHEET_ID);
    expect(screen.queryByTestId(`worksheet-sheet-menu-${PRIMARY_DATA_SHEET_ID}`)).toBeNull();
  });
});
