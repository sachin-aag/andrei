import { describe, expect, it } from "vitest";
import {
  canFoldInsertRows,
  incomingInsertRowsToAdd,
  mergeInsertRowsOperations,
  type InsertRowsOperation,
} from "@/lib/suggestions/merge-insert-rows";

function insertOp(
  rows: string[][],
  extra?: Partial<InsertRowsOperation>
): InsertRowsOperation {
  return {
    kind: "insert_rows",
    tableIndex: 0,
    afterRow: 0,
    rows,
    ...extra,
  };
}

describe("canFoldInsertRows", () => {
  it("folds an overlay insert after the last pending row", () => {
    const existing = insertOp([["Design Qualification", "DQP/GLR-1301"]]);
    const incoming = insertOp([["Installation Qualification", "IQP/GLR-1301"]], {
      afterRow: 1,
      afterRowKey: "Design Qualification",
    });
    expect(canFoldInsertRows(existing, incoming)).toBe(true);
  });

  it("folds a second omit-afterRow captured against the overlay last row", () => {
    const existing = insertOp([["A"], ["B"]]);
    expect(
      canFoldInsertRows(existing, insertOp([["C"]], { afterRow: 2 }))
    ).toBe(true);
  });

  it("folds the same afterRow as an extend of the open card", () => {
    const existing = insertOp([["A"]]);
    expect(canFoldInsertRows(existing, insertOp([["B"]], { afterRow: 0 }))).toBe(
      true
    );
  });

  it("does not fold a different tableIndex or an insert past the pending block", () => {
    const existing = insertOp([["A"]]);
    expect(
      canFoldInsertRows(
        existing,
        insertOp([["B"]], { tableIndex: 1, afterRow: 1 })
      )
    ).toBe(false);
    expect(
      canFoldInsertRows(existing, insertOp([["B"]], { afterRow: 2 }))
    ).toBe(false);
  });

  it("does not fold when overlay capture never resolved afterRow", () => {
    const existing = insertOp([["A"]]);
    expect(
      canFoldInsertRows(
        existing,
        insertOp([["B"]], { afterRow: undefined, afterRowKey: "missing" })
      )
    ).toBe(false);
  });
});

describe("mergeInsertRowsOperations", () => {
  it("appends later rows and keeps the original afterRow snapshot", () => {
    const existing = insertOp([["Design Qualification", "DQP/GLR-1301"]], {
      afterRowKey: undefined,
      expectedRowAtAfter: ["Document Name", "Document Number"],
    });
    const incoming = insertOp(
      [["Installation Qualification", "IQP/GLR-1301"]],
      { afterRow: 1, afterRowKey: "Design Qualification" }
    );
    const merged = mergeInsertRowsOperations(existing, incoming);
    expect(merged.afterRow).toBe(0);
    expect(merged.afterRowKey).toBeUndefined();
    expect(merged.expectedRowAtAfter).toEqual([
      "Document Name",
      "Document Number",
    ]);
    expect(merged.rows).toEqual([
      ["Design Qualification", "DQP/GLR-1301"],
      ["Installation Qualification", "IQP/GLR-1301"],
    ]);
  });

  it("splices after a pending row that is not the last", () => {
    const existing = insertOp([["A"], ["C"]]);
    const merged = mergeInsertRowsOperations(
      existing,
      insertOp([["B"]], { afterRow: 1 })
    );
    expect(merged.rows.map((row) => row[0])).toEqual(["A", "B", "C"]);
  });

  it("dedupes by first-cell text", () => {
    const existing = insertOp([["Design Qualification", "old"]]);
    const merged = mergeInsertRowsOperations(
      existing,
      insertOp(
        [
          ["Design Qualification", "new"],
          ["Installation Qualification", "IQP/GLR-1301"],
        ],
        { afterRow: 1 }
      )
    );
    expect(merged.rows).toEqual([
      ["Design Qualification", "old"],
      ["Installation Qualification", "IQP/GLR-1301"],
    ]);
    expect(
      incomingInsertRowsToAdd(
        existing,
        insertOp([["Design Qualification", "new"]], { afterRow: 1 })
      )
    ).toEqual([]);
  });
});
