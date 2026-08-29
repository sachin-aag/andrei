import { describe, expect, it } from "vitest";
import {
  clampSelection,
  collapseSelection,
  focusColumn,
  isCellInSelection,
  isRowSelection,
  moveSelection,
  rowIsInSelection,
  rowRangeFromGridSelection,
  selectRows,
  selectionBounds,
} from "./grid-selection";

describe("grid selection", () => {
  it("collapses to a single cell", () => {
    expect(collapseSelection(2, 5)).toEqual({
      col: 2,
      row: 5,
      anchorCol: 2,
      anchorRow: 5,
    });
    expect(rowRangeFromGridSelection(collapseSelection(0, 3))).toBeNull();
  });

  it("computes inclusive bounds regardless of drag direction", () => {
    const selection = {
      col: 0,
      row: 9,
      anchorCol: 2,
      anchorRow: 1,
    };
    expect(selectionBounds(selection)).toEqual({
      colStart: 0,
      colEnd: 2,
      rowStart: 1,
      rowEnd: 9,
    });
    expect(isCellInSelection(selection, 1, 5)).toBe(true);
    expect(isCellInSelection(selection, 3, 5)).toBe(false);
    expect(rowRangeFromGridSelection(selection)).toEqual({ start: 2, end: 10 });
  });

  it("extends with shift and collapses without it", () => {
    const start = collapseSelection(0, 0);
    const extended = moveSelection(start, 0, 3, true, 7, 29);
    expect(extended).toEqual({
      col: 0,
      row: 3,
      anchorCol: 0,
      anchorRow: 0,
    });
    const collapsed = moveSelection(extended, 1, 0, false, 7, 29);
    expect(collapsed).toEqual(collapseSelection(1, 3));
  });

  it("clamps focus and anchor to the visible grid", () => {
    expect(
      clampSelection(
        { col: 99, row: -2, anchorCol: -1, anchorRow: 80 },
        7,
        29
      )
    ).toEqual({ col: 7, row: 0, anchorCol: 0, anchorRow: 29 });
  });

  it("selects every cell in the chosen rows without moving Analyze focus", () => {
    const selection = selectRows(4, 1, 2);
    expect(selection).toEqual({
      col: 2,
      row: 4,
      anchorCol: 2,
      anchorRow: 1,
      axis: "row",
    });
    expect(isRowSelection(selection)).toBe(true);
    expect(isCellInSelection(selection, 0, 2)).toBe(true);
    expect(isCellInSelection(selection, 7, 4)).toBe(true);
    expect(isCellInSelection(selection, 2, 0)).toBe(false);
    expect(rowIsInSelection(selection, 1)).toBe(true);
    expect(rowIsInSelection(selection, 5)).toBe(false);
    expect(selectionBounds(selection, 7)).toEqual({
      colStart: 0,
      colEnd: 7,
      rowStart: 1,
      rowEnd: 4,
    });
    expect(rowRangeFromGridSelection(selection)).toEqual({ start: 2, end: 5 });
  });

  it("focusColumn preserves a multi-row span when changing column focus", () => {
    const extended = moveSelection(collapseSelection(0, 0), 0, 9, true, 7, 29);
    expect(rowRangeFromGridSelection(extended)).toEqual({ start: 1, end: 10 });
    const focused = focusColumn(extended, 1);
    expect(focused).toEqual({
      col: 1,
      row: 9,
      anchorCol: 1,
      anchorRow: 0,
    });
    expect(rowRangeFromGridSelection(focused)).toEqual({ start: 1, end: 10 });
    expect(focusColumn(selectRows(4, 1, 2), 3)).toEqual({
      col: 3,
      row: 4,
      anchorCol: 3,
      anchorRow: 1,
      axis: "row",
    });
  });

  it("keeps row-axis when Shift+Arrow extends vertically", () => {
    const start = selectRows(2, 2, 1);
    const extended = moveSelection(start, 0, 2, true, 7, 29);
    expect(extended.axis).toBe("row");
    expect(extended.row).toBe(4);
    expect(extended.anchorRow).toBe(2);
    const sideways = moveSelection(extended, 1, 0, true, 7, 29);
    expect(sideways.axis).toBeUndefined();
  });
});
