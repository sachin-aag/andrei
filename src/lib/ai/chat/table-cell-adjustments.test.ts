import { describe, expect, it } from "vitest";
import {
  tableCellAdjustments,
  tableCellAdjustmentsMessage,
  tableEditProposalMessage,
  tableEditProposalMeta,
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
    expect(tableCellAdjustmentsMessage(adjustments)).toContain("URS-7 Remarks");
    expect(tableCellAdjustmentsMessage(adjustments)).toContain(
      "Do not paste a markdown table of requested RTM rows"
    );
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

  it("names URS rows whose saved Section actually landed, not the requested list", () => {
    const message = tableCellAdjustmentsMessage(
      tableCellAdjustments(
        {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            {
              row: 1,
              col: 4,
              rowKey: "URS-1",
              insertText: "8.2 – Simulation trials at 8000 L",
            },
            {
              row: 6,
              col: 4,
              rowKey: "URS-6",
              insertText: "10.5 – Jacket pressure test",
            },
            {
              row: 12,
              col: 4,
              rowKey: "URS-12",
              insertText: "13.7 – Jacket MOC",
            },
          ],
        },
        {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            {
              row: 1,
              col: 4,
              rowKey: "URS-1",
              insertText: "8.2.3 – Simulation trials at 8000 L",
            },
            { row: 6, col: 4, rowKey: "URS-6", insertText: "" },
            { row: 12, col: 4, rowKey: "URS-12", insertText: "" },
          ],
        },
        (col) => (col === 4 ? "Reference – Section" : null)
      )
    );
    expect(message).toContain("URS-1");
    expect(message).toContain("Left blank: URS-6 Reference – Section");
    expect(message).toContain("URS-12 Reference – Section");
    expect(message).toContain(
      "do not list requested URS rows whose saved Section is empty"
    );
  });

  it("names only the rowKeys that remain on the suggestion card", () => {
    const meta = tableEditProposalMeta(
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 4,
            rowKey: "URS-1",
            insertText: "8.2 – Simulation trials at 8000 L",
          },
          {
            row: 6,
            col: 4,
            rowKey: "URS-6",
            insertText: "10.5 – Jacket pressure test",
          },
          {
            row: 12,
            col: 4,
            rowKey: "URS-12",
            insertText: "13.7 – Jacket MOC",
          },
        ],
      },
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 4,
            rowKey: "URS-1",
            insertText: "8.2 – Simulation trials at 8000 L",
          },
        ],
      }
    );
    expect(meta).toMatchObject({
      requestedCellCount: 3,
      proposedCellCount: 1,
      requestedRowKeys: ["URS-1", "URS-6", "URS-12"],
      proposedRowKeys: ["URS-1"],
      droppedRowKeys: ["URS-6", "URS-12"],
    });
    const message = tableEditProposalMessage(meta);
    expect(message).toContain("URS-1");
    expect(message).toContain("dropped from the card: URS-6, URS-12");
    expect(message).toContain("Do not list droppedRowKeys as updated");
    expect(message).toContain("Wrap-up may name only proposedRowKeys");
  });
});
