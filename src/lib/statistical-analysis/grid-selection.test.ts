import { describe, expect, it } from "vitest";
import {
  clampSelection,
  collapseSelection,
  isCellInSelection,
  moveSelection,
  rowRangeFromGridSelection,
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
});
