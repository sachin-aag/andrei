import { describe, expect, it } from "vitest";
import {
  tableCellAdjustments,
  tableCellAdjustmentsMessage,
} from "@/lib/ai/chat/table-cell-adjustments";

describe("tableCellAdjustments", () => {
  it("lists an edit_cells Remarks the server saved empty", () => {
    const adjustments = tableCellAdjustments(
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 7, col: 3, rowKey: "URS-7", insertText: "IQ [IQ.pdf, p. 25]" },
          { row: 7, col: 5, rowKey: "URS-7", insertText: "Complies" },
        ],
      },
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 7, col: 3, rowKey: "URS-7", insertText: "IQ [IQ.pdf, p. 25]" },
          { row: 7, col: 5, rowKey: "URS-7", insertText: "" },
        ],
      },
      (col) => (col === 5 ? "Remarks" : null)
    );
    expect(adjustments).toEqual([
      {
        rowKey: "URS-7",
        row: 7,
        col: 5,
        column: "Remarks",
        requested: "Complies",
        saved: "",
      },
    ]);
    expect(tableCellAdjustmentsMessage(adjustments)).toMatch(/saved empty/);
  });

  it("treats a dropped cell as saved empty", () => {
    const adjustments = tableCellAdjustments(
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 2, col: 4, rowKey: "URS-2", insertText: "Section 13" }],
      },
      { kind: "edit_cells", tableIndex: 0, cells: [] }
    );
    expect(adjustments).toMatchObject([{ rowKey: "URS-2", saved: "" }]);
  });

  it("reports rewritten insert_rows cells and ignores unchanged ones", () => {
    expect(
      tableCellAdjustments(
        {
          kind: "insert_rows",
          tableIndex: 0,
          rows: [["URS-5", "Jacket", "20-25 °C", "DQ", "12.1", "Complies"]],
        },
        {
          kind: "insert_rows",
          tableIndex: 0,
          rows: [["URS-5", "Jacket", "20-25 °C", "IQ [IQ.pdf, p. 22]", "13.3.5.1", ""]],
        }
      ).map((adj) => [adj.col, adj.saved])
    ).toEqual([
      [3, "IQ [IQ.pdf, p. 22]"],
      [4, "13.3.5.1"],
      [5, ""],
    ]);
  });

  it("is empty when everything landed as requested", () => {
    const op = {
      kind: "edit_cells" as const,
      tableIndex: 0,
      cells: [{ row: 1, col: 5, rowKey: "URS-1", insertText: "Complies" }],
    };
    expect(tableCellAdjustments(op, op)).toEqual([]);
  });
});
