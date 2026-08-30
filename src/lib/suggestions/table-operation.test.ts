import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import {
  applyTableOperation,
  captureTableOperationSnapshots,
  parseTableOperation,
  summarizeTableOperation,
  type TableOperation,
} from "@/lib/suggestions/table-operation";

function textCell(
  type: "tableHeader" | "tableCell",
  text: string,
  extra?: { marks?: JSONContent["marks"]; placeholder?: boolean }
): JSONContent {
  const content: JSONContent[] = text
    ? [
        {
          type: "text",
          text,
          ...(extra?.marks ? { marks: extra.marks } : {}),
        },
      ]
    : [];
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [
      {
        type: "paragraph",
        content: content.length ? content : undefined,
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

function twoTablesDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      tableDoc(["A", "B"], [["a1", "b1"]]).content![0]!,
      tableDoc(["X", "Y"], [["x1", "y1"]]).content![0]!,
    ],
  };
}

function cellText(doc: JSONContent, row: number, col: number, tableIndex = 0): string {
  const tables = (doc.content ?? []).filter((n) => n.type === "table");
  const table = tables[tableIndex]!;
  const rows = (table.content ?? []).filter((n) => n.type === "tableRow");
  const cells = (rows[row]!.content ?? []).filter(
    (n) => n.type === "tableCell" || n.type === "tableHeader"
  );
  return flattenForAnchor(cells[col]!).text.replace(/\s+/g, " ").trim();
}

function colCount(doc: JSONContent, tableIndex = 0): number {
  const tables = (doc.content ?? []).filter((n) => n.type === "table");
  const header = (tables[tableIndex]!.content ?? []).find((n) => n.type === "tableRow")!;
  return (header.content ?? []).filter(
    (n) => n.type === "tableCell" || n.type === "tableHeader"
  ).length;
}

function rowCount(doc: JSONContent, tableIndex = 0): number {
  const tables = (doc.content ?? []).filter((n) => n.type === "table");
  return (tables[tableIndex]!.content ?? []).filter((n) => n.type === "tableRow").length;
}

function manufacturerFilledDoc(): JSONContent {
  const doc = tableDoc(
    ["Equipment", "Manufacturer", "Software"],
    [
      ["UUT-1", "[manufacturer]", "4.7.1"],
      ["UUT-2", "[manufacturer]", "4.7.1"],
    ]
  );
  const manufacturer = (
    (doc.content![0]!.content![1] as JSONContent).content![1] as JSONContent
  );
  manufacturer.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Acme Corp", marks: [{ type: "bold" }] }],
    },
  ];
  return doc;
}

describe("applyTableOperation", () => {
  it("keeps filled placeholders and marks when inserting a Description column", () => {
    const before = manufacturerFilledDoc();
    const result = applyTableOperation(before, {
      kind: "insert_column",
      tableIndex: 0,
      afterCol: 2,
      header: "Description",
      values: ["Dental laser", "Dental laser"],
      expectedHeaderAtAfterCol: "Software",
      expectedHeaders: ["Equipment", "Manufacturer", "Software"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(cellText(result.doc, 1, 1)).toBe("Acme Corp");
    expect(cellText(result.doc, 1, 0)).toBe("UUT-1");
    expect(cellText(result.doc, 0, 3)).toBe("Description");
    expect(cellText(result.doc, 1, 3)).toBe("Dental laser");
    const manufacturerCell = (
      result.doc.content![0]!.content![1] as JSONContent
    ).content![1] as JSONContent;
    const textNode = manufacturerCell.content![0]!.content![0]!;
    expect(textNode.marks).toEqual([{ type: "bold" }]);
  });

  it("edits several cells atomically without touching others", () => {
    const result = applyTableOperation(tableDoc(["H1", "H2"], [["a", "b"], ["c", "d"]]), {
      kind: "edit_cells",
      tableIndex: 0,
      cells: [
        { row: 1, col: 0, expectedText: "a", insertText: "A" },
        { row: 2, col: 1, expectedText: "d", insertText: "" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(cellText(result.doc, 1, 0)).toBe("A");
    expect(cellText(result.doc, 1, 1)).toBe("b");
    expect(cellText(result.doc, 2, 0)).toBe("c");
    expect(cellText(result.doc, 2, 1)).toBe("");
  });

  it("matches the structured-grid empty-cell label when editing an empty cell", () => {
    const result = applyTableOperation(tableDoc(["H1", "H2"], [["a", ""]]), {
      kind: "edit_cells",
      tableIndex: 0,
      cells: [{ row: 1, col: 1, expectedText: "(empty)", insertText: "Filled" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(cellText(result.doc, 1, 1)).toBe("Filled");
  });

  it("inserts and appends rows", () => {
    const doc = tableDoc(["H1", "H2"], [["a", "b"]]);
    const inserted = applyTableOperation(doc, {
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: 0,
      rows: [["x", "y"]],
      expectedRowAtAfter: ["H1", "H2"],
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(rowCount(inserted.doc)).toBe(3);
    expect(cellText(inserted.doc, 1, 0)).toBe("x");
    expect(cellText(inserted.doc, 2, 0)).toBe("a");

    const appended = applyTableOperation(inserted.doc, {
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: 2,
      rows: [["end", "row"]],
      expectedRowAtAfter: ["a", "b"],
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    expect(cellText(appended.doc, 3, 0)).toBe("end");
  });

  it("deletes multiple rows from the highest index downward", () => {
    const result = applyTableOperation(
      tableDoc(["H"], [["a"], ["b"], ["c"]]),
      {
        kind: "delete_rows",
        tableIndex: 0,
        rows: [
          { row: 1, expectedCells: ["a"] },
          { row: 3, expectedCells: ["c"] },
        ],
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(rowCount(result.doc)).toBe(2);
    expect(cellText(result.doc, 1, 0)).toBe("b");
  });

  it("captures omitted row snapshots before persisting a delete proposal", () => {
    const doc = tableDoc(["H1", "H2"], [["first", "row"], ["second", "row"]]);
    const captured = captureTableOperationSnapshots(doc, {
      kind: "delete_rows",
      tableIndex: 0,
      rows: [{ row: 1, expectedCells: [] }],
    });

    expect(captured).toEqual({
      kind: "delete_rows",
      tableIndex: 0,
      rows: [{ row: 1, expectedCells: ["first", "row"] }],
    });
    expect(applyTableOperation(doc, captured).ok).toBe(true);
  });

  it("captures an insertion anchor snapshot when the model omits it", () => {
    const doc = tableDoc(["H1", "H2"], [["first", "row"]]);
    const captured = captureTableOperationSnapshots(doc, {
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: 1,
      rows: [["second", "row"]],
    });

    expect(captured).toMatchObject({
      expectedRowAtAfter: ["first", "row"],
    });
  });

  it("defaults omitted afterRow to the last existing row", () => {
    const doc = tableDoc(["H1", "H2"], [["first", "row"]]);
    const captured = captureTableOperationSnapshots(doc, {
      kind: "insert_rows",
      tableIndex: 0,
      rows: [["second", "row"]],
    });

    expect(captured).toMatchObject({
      afterRow: 1,
      expectedRowAtAfter: ["first", "row"],
    });
    expect(applyTableOperation(doc, captured).ok).toBe(true);
  });

  it("refuses to delete the header row", () => {
    const result = applyTableOperation(tableDoc(["H"], [["a"]]), {
      kind: "delete_rows",
      tableIndex: 0,
      rows: [{ row: 0, expectedCells: ["H"] }],
    });
    expect(result).toEqual({
      ok: false,
      status: "invalid",
      hint: "Cannot delete the header row.",
    });
  });

  it("inserts a column at the start and deletes a column", () => {
    const inserted = applyTableOperation(tableDoc(["A", "B"], [["1", "2"]]), {
      kind: "insert_column",
      tableIndex: 0,
      afterCol: -1,
      header: "New",
      values: ["n"],
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(cellText(inserted.doc, 0, 0)).toBe("New");
    expect(cellText(inserted.doc, 1, 0)).toBe("n");
    expect(cellText(inserted.doc, 1, 1)).toBe("1");

    const deleted = applyTableOperation(inserted.doc, {
      kind: "delete_column",
      tableIndex: 0,
      col: 0,
      expectedHeaderText: "New",
      expectedHeaders: ["New", "A", "B"],
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(colCount(deleted.doc)).toBe(2);
    expect(cellText(deleted.doc, 0, 0)).toBe("A");
  });

  it("targets the second table by tableIndex", () => {
    const result = applyTableOperation(twoTablesDoc(), {
      kind: "edit_cells",
      tableIndex: 1,
      cells: [{ row: 1, col: 0, expectedText: "x1", insertText: "X1" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(cellText(result.doc, 1, 0, 0)).toBe("a1");
    expect(cellText(result.doc, 1, 0, 1)).toBe("X1");
  });

  it("rejects malformed coordinates and stale expected text", () => {
    const doc = tableDoc(["H1", "H2"], [["a", "b"]]);
    expect(
      applyTableOperation(doc, {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 9, col: 0, expectedText: "a", insertText: "z" }],
      }).status
    ).toBe("bad_scope");
    expect(
      applyTableOperation(doc, {
        kind: "edit_cells",
        tableIndex: 4,
        cells: [{ row: 1, col: 0, expectedText: "a", insertText: "z" }],
      }).status
    ).toBe("bad_scope");
    expect(
      applyTableOperation(doc, {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, expectedText: "stale", insertText: "z" }],
      }).status
    ).toBe("stale");
    expect(
      applyTableOperation({ type: "doc", content: [] }, {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 0, col: 0, expectedText: "", insertText: "z" }],
      }).status
    ).toBe("no_table");
  });

  it("rejects column ops and header renames on fixed DV matrices", () => {
    const doc = seededTableDoc(["Requirement ID", "Design Input", "Design Output"]);
    const ctx = { section: "traceability" as const, targetField: "table" };
    expect(
      applyTableOperation(
        doc,
        {
          kind: "insert_column",
          tableIndex: 0,
          afterCol: 0,
          header: "Extra",
          expectedHeaderAtAfterCol: "Requirement ID",
        },
        ctx
      ).status
    ).toBe("fixed_schema");
    expect(
      applyTableOperation(
        doc,
        {
          kind: "delete_column",
          tableIndex: 0,
          col: 0,
          expectedHeaderText: "Requirement ID",
        },
        ctx
      ).status
    ).toBe("fixed_schema");
    expect(
      applyTableOperation(
        doc,
        {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            {
              row: 0,
              col: 0,
              expectedText: "Requirement ID",
              insertText: "Req",
            },
          ],
        },
        ctx
      ).status
    ).toBe("fixed_schema");

    const fill = applyTableOperation(
      doc,
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, expectedText: "", insertText: "DI-1" }],
      },
      ctx
    );
    expect(fill.ok).toBe(true);
  });

  it("rejects column ops on Convergent equipment matrices", () => {
    const result = applyTableOperation(
      seededTableDoc(["Equipment", "ID", "Calibration"]),
      {
        kind: "insert_column",
        tableIndex: 0,
        afterCol: 0,
        header: "Notes",
      },
      { section: "test_equipment", targetField: "table" }
    );
    expect(result.status).toBe("fixed_schema");
  });

  it("appends a new table and pads short rows", () => {
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Intro." }],
        },
      ],
    };
    const result = applyTableOperation(before, {
      kind: "create_table",
      headers: ["Req", "Result", "Notes"],
      rows: [["SW-1", "Pass"], ["SW-2", "Fail", "see log", "extra"]],
    });
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    expect(result.doc.content?.map((n) => n.type)).toEqual(["paragraph", "table"]);
    expect(cellText(result.doc, 0, 0)).toBe("Req");
    expect(cellText(result.doc, 1, 2)).toBe("");
    expect(cellText(result.doc, 2, 2)).toBe("see log");
    expect(colCount(result.doc)).toBe(3);
    expect(rowCount(result.doc)).toBe(3);
  });

  it("inserts a new table before trailing Citations", () => {
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Purpose of this verification." }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [protocol.pdf, p. 3]" }],
        },
      ],
    };
    const result = applyTableOperation(before, {
      kind: "create_table",
      headers: ["VCS", "Meaning"],
      rows: [["1", "Design"]],
    });
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    const types = result.doc.content?.map((n) => n.type) ?? [];
    const citeAt = result.doc.content?.findIndex(
      (n) => flattenForAnchor(n).text.trim() === "Citations:"
    );
    expect(citeAt).toBeGreaterThan(0);
    expect(types[1]).toBe("table");
    expect(types.slice(citeAt).includes("table")).toBe(false);
  });

  it("parks a table that was appended below Citations, then inserts the new table above the list", () => {
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "This report covers Solea Model 3." }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "1. [790-00134R_Rev_U.docx, p. 1]",
            },
          ],
        },
        tableDoc(["Solea Model 3.0 SW Application Version", "Reason for Build"], [
          ["3.0.1", "Initial"],
        ]).content![0]!,
      ],
    };
    const result = applyTableOperation(before, {
      kind: "create_table",
      headers: ["Config", "Notes"],
      rows: [["A", "Added"]],
    });
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    const types = result.doc.content?.map((n) => n.type);
    expect(types?.slice(0, 3)).toEqual(["paragraph", "table", "table"]);
    expect(types?.at(-2)).toBe("paragraph");
    expect(flattenForAnchor(result.doc.content!.at(-2)!).text.trim()).toBe(
      "Citations:"
    );
    expect(flattenForAnchor(result.doc.content!.at(-1)!).text.trim()).toMatch(
      /790-00134R/
    );
    expect(cellText(result.doc, 0, 0, 0)).toBe("Solea Model 3.0 SW Application Version");
    expect(cellText(result.doc, 0, 0, 1)).toBe("Config");
  });

  it("does not insert afterAnchor below a Citations heading", () => {
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Scope covers software." }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [protocol.pdf, p. 1]" }],
        },
      ],
    };
    const result = applyTableOperation(before, {
      kind: "create_table",
      headers: ["A"],
      rows: [["1"]],
      afterAnchor: "1. [protocol.pdf, p. 1]",
    });
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    const types = result.doc.content?.map((n) => n.type) ?? [];
    const citeAt = result.doc.content?.findIndex(
      (n) => flattenForAnchor(n).text.trim() === "Citations:"
    );
    expect(citeAt).toBeGreaterThan(0);
    expect(types.slice(0, citeAt).includes("table")).toBe(true);
    expect(types.slice(citeAt).includes("table")).toBe(false);
  });

  it("inserts after a unique afterAnchor block", () => {
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First paragraph." }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second paragraph." }],
        },
      ],
    };
    const result = applyTableOperation(before, {
      kind: "create_table",
      headers: ["A"],
      rows: [["1"]],
      afterAnchor: "First paragraph.",
    });
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    expect(result.doc.content?.map((n) => n.type)).toEqual([
      "paragraph",
      "table",
      "paragraph",
    ]);
  });

  it("refuses a missing or ambiguous afterAnchor", () => {
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "The assay failed." }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "The assay failed again." }],
        },
      ],
    };
    expect(
      applyTableOperation(before, {
        kind: "create_table",
        headers: ["A"],
        afterAnchor: "not in the field",
      }).status
    ).toBe("bad_scope");
    expect(
      applyTableOperation(before, {
        kind: "create_table",
        headers: ["A"],
        afterAnchor: "The assay failed",
      }).status
    ).toBe("bad_scope");
  });

  it("refuses create_table on a seeded DV matrix field", () => {
    const result = applyTableOperation(
      seededTableDoc(["Equipment", "ID", "Calibration"]),
      { kind: "create_table", headers: ["A", "B"] },
      { section: "test_equipment", targetField: "table" }
    );
    expect(result.status).toBe("fixed_schema");
  });
});

describe("parseTableOperation", () => {
  it("round-trips a valid insert_column payload", () => {
    const raw: TableOperation = {
      kind: "insert_column",
      tableIndex: 0,
      afterCol: 2,
      header: "Description",
      values: ["Dental laser"],
      expectedHeaders: ["Equipment", "Manufacturer", "Software"],
    };
    expect(parseTableOperation(raw)).toEqual(raw);
  });

  it("rejects unknown kinds and malformed coordinates", () => {
    expect(parseTableOperation({ kind: "rewrite_table", tableIndex: 0 })).toBeUndefined();
    expect(
      parseTableOperation({
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: -1, col: 0, expectedText: "a", insertText: "b" }],
      })
    ).toBeUndefined();
    expect(parseTableOperation({ kind: "insert_rows", afterRow: 0, rows: [] })).toBeUndefined();
    expect(parseTableOperation({ kind: "create_table", headers: [] })).toBeUndefined();
  });

  it("round-trips create_table", () => {
    const raw: TableOperation = {
      kind: "create_table",
      headers: ["Req", "Result"],
      rows: [["SW-1", "Pass"]],
      afterAnchor: "Purpose of this verification.",
    };
    expect(parseTableOperation(raw)).toEqual(raw);
  });
});

describe("summarizeTableOperation", () => {
  it("describes a populated column insert", () => {
    expect(
      summarizeTableOperation({
        kind: "insert_column",
        tableIndex: 0,
        afterCol: 2,
        header: "Description",
        values: ["a", "b", "", "c"],
      })
    ).toBe("Add “Description” column; populate 3 rows");
  });

  it("describes a new table", () => {
    expect(
      summarizeTableOperation({
        kind: "create_table",
        headers: ["A", "B"],
        rows: [["1", "2"]],
      })
    ).toBe("Create a 2-column table with 1 row");
  });
});
