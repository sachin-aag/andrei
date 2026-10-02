import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { applyTableOperation } from "@/lib/suggestions/table-operation";
import {
  canFoldInsertRows,
  foldSameTableRowOperations,
  incomingInsertRowsToAdd,
  mergeInsertRowsOperations,
  type EditCellsOperation,
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

function textCell(
  type: "tableHeader" | "tableCell",
  text: string
): JSONContent {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : undefined,
      },
    ],
  };
}

function tableDoc(headers: string[], rows: string[][]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: headers.map((h) => textCell("tableHeader", h)),
          },
          ...rows.map((row) => ({
            type: "tableRow" as const,
            content: row.map((c) => textCell("tableCell", c)),
          })),
        ],
      },
    ],
  };
}

function scaffoldCells(values: readonly string[]): EditCellsOperation {
  return {
    kind: "edit_cells",
    tableIndex: 0,
    cells: values.map((insertText, col) => ({
      row: 1,
      col,
      insertText,
    })),
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

  it("folds an afterRow 0 follow-up onto a card captured after the seeded blank row", () => {
    const existing = insertOp([["Design Qualification"]], { afterRow: 1 });
    const incoming = insertOp([["Installation Qualification"]], {
      afterRow: 0,
    });
    expect(canFoldInsertRows(existing, incoming)).toBe(true);
    expect(
      mergeInsertRowsOperations(existing, incoming).rows.map((row) => row[0])
    ).toEqual(["Design Qualification", "Installation Qualification"]);
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

describe("foldSameTableRowOperations", () => {
  const seeded = tableDoc(["Document", "Number"], [["", ""]]);

  it("folds scaffold edit_cells then insert_rows onto one afterRow-0 card", () => {
    const fold = foldSameTableRowOperations(
      scaffoldCells(["Design Qualification", "DQP-1"]),
      insertOp([["Installation Qualification", "IQP-1"]], { afterRow: 1 }),
      seeded
    );
    expect(fold.status).toBe("folded");
    if (fold.status !== "folded") return;
    expect(fold.operation.afterRow).toBe(0);
    expect(fold.operation.rows.map((row) => row[0])).toEqual([
      "Design Qualification",
      "Installation Qualification",
    ]);
    const applied = applyTableOperation(seeded, fold.operation);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const rows = (applied.doc.content ?? [])
      .filter((node) => node.type === "table")
      .flatMap((table) =>
        (table.content ?? []).filter((node) => node.type === "tableRow")
      );
    expect(rows).toHaveLength(3);
    const firstCell = (row: JSONContent) => {
      const cell = (row.content ?? []).find(
        (node) => node.type === "tableCell" || node.type === "tableHeader"
      );
      const text = cell?.content?.[0]?.content?.[0];
      return text && "text" in text ? String(text.text) : "";
    };
    expect(firstCell(rows[1]!)).toBe("Design Qualification");
    expect(firstCell(rows[2]!)).toBe("Installation Qualification");
  });

  it("prepends a later scaffold edit_cells onto an existing insert_rows card", () => {
    const fold = foldSameTableRowOperations(
      insertOp([["Installation Qualification", "IQP-1"]], { afterRow: 1 }),
      scaffoldCells(["Design Qualification", "DQP-1"]),
      seeded
    );
    expect(fold.status).toBe("folded");
    if (fold.status !== "folded") return;
    expect(fold.operation.afterRow).toBe(0);
    expect(fold.operation.rows.map((row) => row[0])).toEqual([
      "Design Qualification",
      "Installation Qualification",
    ]);
  });

  it("does not fold edit_cells of an already filled row", () => {
    const filled = tableDoc(
      ["Document", "Number"],
      [["Existing Qualification", "EQ-1"]]
    );
    const cells: EditCellsOperation = {
      kind: "edit_cells",
      tableIndex: 0,
      cells: [{ row: 1, col: 1, insertText: "EQ-1-REV" }],
    };
    expect(
      foldSameTableRowOperations(
        cells,
        insertOp([["Design Qualification", "DQP-1"]], { afterRow: 1 }),
        filled
      ).status
    ).toBe("no_fold");
  });
});
