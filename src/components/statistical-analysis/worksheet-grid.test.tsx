// @vitest-environment jsdom

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  collapseSelection,
  type GridSelection,
} from "@/lib/statistical-analysis/grid-selection";
import {
  createEmptyWorksheet,
  setCell,
} from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";
import { WorksheetGrid } from "./worksheet-grid";

function GridHarness() {
  const [worksheet, setWorksheet] = useState<WorksheetData>(() => {
    let sheet = createEmptyWorksheet(2);
    sheet = setCell(sheet, 0, 0, "a1");
    sheet = setCell(sheet, 1, 0, "b1");
    sheet = setCell(sheet, 0, 1, "a2");
    sheet = setCell(sheet, 1, 1, "b2");
    return sheet;
  });
  const [selection, setSelection] = useState<GridSelection>(() =>
    collapseSelection(1, 0)
  );
  return (
    <WorksheetGrid
      worksheet={worksheet}
      selection={selection}
      onSelectionChange={setSelection}
      onChange={setWorksheet}
    />
  );
}

describe("WorksheetGrid row selection", () => {
  it("selects every cell in a row when the row header is clicked", async () => {
    const user = userEvent.setup();
    render(<GridHarness />);

    await user.click(screen.getByTestId("row-header-1"));

    const grid = screen.getByTestId("worksheet-grid");
    expect(grid).toHaveAttribute("data-selection-axis", "row");
    expect(grid).toHaveAttribute("data-row-start", "1");
    expect(grid).toHaveAttribute("data-row-end", "1");
    expect(screen.getByTestId("cell-c1-1")).toHaveAttribute(
      "data-in-selection",
      "true"
    );
    expect(screen.getByTestId("cell-c2-1")).toHaveAttribute(
      "data-in-selection",
      "true"
    );
    expect(screen.getByTestId("cell-c1-0")).not.toHaveAttribute(
      "data-in-selection"
    );
  });

  it("extends a row selection with Shift+click", async () => {
    const user = userEvent.setup();
    render(<GridHarness />);

    await user.click(screen.getByTestId("row-header-0"));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByTestId("row-header-1"));
    await user.keyboard("{/Shift}");

    const grid = screen.getByTestId("worksheet-grid");
    expect(grid).toHaveAttribute("data-selection-axis", "row");
    expect(grid).toHaveAttribute("data-row-start", "0");
    expect(grid).toHaveAttribute("data-row-end", "1");
    expect(screen.getByTestId("cell-c2-0")).toHaveAttribute(
      "data-in-selection",
      "true"
    );
    expect(screen.getByTestId("cell-c1-1")).toHaveAttribute(
      "data-in-selection",
      "true"
    );
  });
});
