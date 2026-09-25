import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  DV_TRACEABILITY_HEADERS,
  seededTableDoc,
} from "@/lib/document-types/design-verification/sections";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import {
  applyTableOperation,
  captureTableOperationSnapshots,
  existingTableCountFromContents,
  filledTableNumberInDocument,
  isBannerTableRow,
  parseTableOperation,
  prefixTableCaptionMarkdown,
  renumberFilledTableCaptions,
  summarizeTableOperation,
  tableOperationInvalidHint,
  type TableOperation,
} from "@/lib/suggestions/table-operation";
import { QSR_RTM_HEADERS } from "@/lib/document-types/qsr/sections";
import {
  ELR_MEDIA_FILL_HEADERS,
  ELR_MONITORING_HEADERS,
  ELR_RESPONSIBILITIES_HEADERS,
  EMPTY_ELR_CONTENT,
} from "@/lib/document-types/elr/sections";

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

function tableRowAt(doc: JSONContent, row: number, tableIndex = 0): JSONContent {
  const tables = (doc.content ?? []).filter((n) => n.type === "table");
  return (tables[tableIndex]!.content ?? []).filter((n) => n.type === "tableRow")[row]!;
}

function cellColspan(doc: JSONContent, row: number, col: number): number {
  const cells = (tableRowAt(doc, row).content ?? []).filter(
    (n) => n.type === "tableCell" || n.type === "tableHeader"
  );
  const raw = cells[col]?.attrs?.colspan;
  return typeof raw === "number" ? raw : 1;
}

function bannerRow(text: string, colspan: number): JSONContent {
  return {
    type: "tableRow",
    content: [
      {
        type: "tableCell",
        attrs: { colspan, rowspan: 1, colwidth: null },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text, marks: [{ type: "bold" }] }],
          },
        ],
      },
    ],
  };
}

function rtmRow(id: string, requirement = `${id} text`): string[] {
  return [id, "Parameter", requirement, "", "", ""];
}

function rtmDoc(ids: string[], bannersAt?: Record<number, string>): JSONContent {
  const doc = tableDoc([...QSR_RTM_HEADERS], ids.map((id) => rtmRow(id)));
  const table = doc.content![0]!;
  if (bannersAt) {
    const rows = [...(table.content ?? [])];
    for (const [index, label] of Object.entries(bannersAt)) {
      rows.splice(Number(index), 0, bannerRow(label, QSR_RTM_HEADERS.length));
    }
    table.content = rows;
  }
  return doc;
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
      result.doc.content!.find((n) => n.type === "table")!.content![1] as JSONContent
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

  it("sizes insert_rows from the header when the last data row is narrower", () => {
    const ragged = tableDoc(
      [...DV_TRACEABILITY_HEADERS],
      [["SYS-006", "Auth required"]]
    );
    const result = applyTableOperation(
      ragged,
      {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [[
          "SYS-007",
          "Session timeout",
          "TM-002",
          "PASS",
          "N/A",
        ]],
      },
      { section: "traceability", targetField: "table" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(cellText(result.doc, 2, 0)).toBe("SYS-007");
    expect(cellText(result.doc, 2, 4)).toBe("N/A");
  });

  it("tells the model to insert_rows when edit_cells targets a missing row", () => {
    const result = applyTableOperation(
      seededTableDoc(DV_TRACEABILITY_HEADERS),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 2, col: 0, insertText: "SYS-007" }],
      },
      { section: "traceability", targetField: "table" }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("bad_scope");
    expect(result.hint).toMatch(/insert_rows/);
  });

  it("names live headers when insert_rows width does not match the table", () => {
    const result = applyTableOperation(
      seededTableDoc(DV_TRACEABILITY_HEADERS),
      {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [["SYS-007", "Timeout"]],
      },
      { section: "traceability", targetField: "table" }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("invalid");
    expect(result.hint).toMatch(/Live headers \(5\): Requirement ID/);
    expect(result.hint).toMatch(/Risk Control Link/);
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

  it("removes a whole table and keeps surrounding prose, figures, and citations", () => {
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Purpose of this revision." }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "imageInline",
              attrs: { src: "data:image/png;base64,xx", alt: "Assay" },
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [protocol.pdf, p. 2]" }],
        },
        tableDoc(
          ["Component", "Description", "Example"],
          [
            ["mm", "Major", "04"],
            ["nn", "Minor", "08"],
            ["ff", "Fix", "01"],
            ["bb", "Build", "1164"],
          ]
        ).content![0]!,
      ],
    };
    const result = applyTableOperation(before, {
      kind: "delete_table",
      tableIndex: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content?.some((node) => node.type === "table")).toBe(false);
    expect(JSON.stringify(result.doc)).toContain("Purpose of this revision.");
    expect(JSON.stringify(result.doc)).toContain("imageInline");
    expect(flattenForAnchor(result.doc.content!.at(-2)!).text.trim()).toBe(
      "Citations:"
    );
    expect(flattenForAnchor(result.doc.content!.at(-1)!).text.trim()).toMatch(
      /protocol\.pdf/
    );
  });

  it("deletes only the targeted table when more than one exists", () => {
    const result = applyTableOperation(twoTablesDoc(), {
      kind: "delete_table",
      tableIndex: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content?.filter((n) => n.type === "table")).toHaveLength(1);
    expect(cellText(result.doc, 0, 0, 0)).toBe("X");
  });

  it("upgrades a delete of every data row into delete_table", () => {
    const doc = tableDoc(["H"], [["a"], ["b"], ["c"]]);
    const captured = captureTableOperationSnapshots(doc, {
      kind: "delete_rows",
      tableIndex: 0,
      rows: [
        { row: 1, expectedCells: [] },
        { row: 2, expectedCells: [] },
        { row: 3, expectedCells: [] },
      ],
    });
    expect(captured).toEqual({ kind: "delete_table", tableIndex: 0 });
    const result = applyTableOperation(doc, captured);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content?.some((node) => node.type === "table")).toBe(false);
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

  it("still inserts after a sibling fill of a previously empty anchor row", () => {
    const empty = tableDoc(
      [...ELR_RESPONSIBILITIES_HEADERS],
      [["", "", ""]]
    );
    const filled = applyTableOperation(empty, {
      kind: "edit_cells",
      tableIndex: 0,
      cells: [
        { row: 1, col: 0, expectedText: "", insertText: "1" },
        { row: 1, col: 1, expectedText: "", insertText: "QA" },
        { row: 1, col: 2, expectedText: "", insertText: "Approve the report" },
      ],
    });
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;

    const inserted = applyTableOperation(filled.doc, {
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: 1,
      rows: [
        ["2", "Engineering", "Maintain the line"],
        ["3", "Production", "Operate the filling line"],
      ],
      expectedRowAtAfter: ["", "", ""],
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(rowCount(inserted.doc)).toBe(4);
    expect(cellText(inserted.doc, 1, 1)).toBe("QA");
    expect(cellText(inserted.doc, 2, 1)).toBe("Engineering");
    expect(cellText(inserted.doc, 3, 1)).toBe("Production");
  });

  it("still inserts when previously empty snapshot cells were filled", () => {
    const result = applyTableOperation(
      tableDoc(["H1", "H2"], [["QA", "Approves"]]),
      {
        kind: "insert_rows",
        tableIndex: 0,
        afterRow: 1,
        rows: [["2", "Engineering"]],
        expectedRowAtAfter: ["QA", ""],
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(cellText(result.doc, 2, 1)).toBe("Engineering");
  });

  it("still rejects insert_rows when a filled snapshot cell changed", () => {
    const result = applyTableOperation(
      tableDoc(["H1", "H2"], [["changed", "row"]]),
      {
        kind: "insert_rows",
        tableIndex: 0,
        afterRow: 1,
        rows: [["x", "y"]],
        expectedRowAtAfter: ["first", "row"],
      }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("stale");
  });

  it("does not copy a banner colspan onto inserted data rows", () => {
    const doc = rtmDoc(["URS-1"]);
    const table = doc.content![0]!;
    table.content = [
      ...(table.content ?? []),
      bannerRow("ANY SPECIFIC REQUIREMENTS", 6),
    ];
    const result = applyTableOperation(doc, {
      kind: "insert_rows",
      tableIndex: 0,
      afterRowKey: "ANY SPECIFIC REQUIREMENTS",
      rows: [rtmRow("URS-58")],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(cellText(result.doc, 3, 0)).toBe("URS-58");
    expect(cellColspan(result.doc, 3, 0)).toBe(1);
    expect(tableRowAt(result.doc, 3).content).toHaveLength(6);
  });

  it("does not insert a merged banner row from { banner }", () => {
    expect(
      parseTableOperation({
        kind: "insert_rows",
        afterRowKey: "URS-1",
        rows: [{ banner: "ANY SPECIFIC REQUIREMENTS" }],
      })
    ).toBeUndefined();
  });

  it("resolves afterRowKey even when afterRow is stale", () => {
    const first = applyTableOperation(rtmDoc(["URS-1", "URS-2", "URS-3"]), {
      kind: "insert_rows",
      tableIndex: 0,
      afterRowKey: "URS-1",
      rows: [rtmRow("URS-1a")],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyTableOperation(first.doc, {
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: 1,
      afterRowKey: "URS-3",
      rows: [rtmRow("URS-4")],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(cellText(second.doc, 1, 0)).toBe("URS-1");
    expect(cellText(second.doc, 2, 0)).toBe("URS-1a");
    expect(cellText(second.doc, 3, 0)).toBe("URS-2");
    expect(cellText(second.doc, 4, 0)).toBe("URS-3");
    expect(cellText(second.doc, 5, 0)).toBe("URS-4");
  });

  it("rejects a missing or ambiguous afterRowKey", () => {
    const missing = applyTableOperation(rtmDoc(["URS-1"]), {
      kind: "insert_rows",
      tableIndex: 0,
      afterRowKey: "URS-99",
      rows: [rtmRow("URS-2")],
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe("bad_scope");

    const dup = applyTableOperation(rtmDoc(["URS-1", "URS-1"]), {
      kind: "insert_rows",
      tableIndex: 0,
      afterRowKey: "URS-1",
      rows: [rtmRow("URS-2")],
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.status).toBe("bad_scope");
  });

  it("replays keyed inserts around 5.1 banners in URS order", () => {
    const start = applyTableOperation(
      rtmDoc(
        [
          "URS-1",
          "URS-8",
          "URS-9",
          "URS-10",
          "URS-11",
          "URS-12",
          "URS-16",
          "URS-29",
        ],
        { 9: "ANY SPECIFIC REQUIREMENTS", 10: "OTHER AUXILIARY REQUIREMENT" }
      ),
      {
        kind: "insert_rows",
        tableIndex: 0,
        afterRow: 17,
        afterRowKey: "URS-16",
        rows: [rtmRow("URS-17"), rtmRow("URS-18")],
      }
    );
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const withSpecific = applyTableOperation(start.doc, {
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: 14,
      afterRowKey: "ANY SPECIFIC REQUIREMENTS",
      rows: [rtmRow("URS-58")],
    });
    expect(withSpecific.ok).toBe(true);
    if (!withSpecific.ok) return;
    const withAux = applyTableOperation(withSpecific.doc, {
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: 36,
      afterRowKey: "OTHER AUXILIARY REQUIREMENT",
      rows: [rtmRow("URS-67"), rtmRow("URS-68")],
    });
    expect(withAux.ok).toBe(true);
    if (!withAux.ok) return;
    const ids: string[] = [];
    for (let r = 1; r < rowCount(withAux.doc); r += 1) {
      ids.push(cellText(withAux.doc, r, 0));
    }
    expect(ids).toEqual([
      "URS-1",
      "URS-8",
      "URS-9",
      "URS-10",
      "URS-11",
      "URS-12",
      "URS-16",
      "URS-17",
      "URS-18",
      "URS-29",
      "ANY SPECIFIC REQUIREMENTS",
      "URS-58",
      "OTHER AUXILIARY REQUIREMENT",
      "URS-67",
      "URS-68",
    ]);
    expect(isBannerTableRow(tableRowAt(withAux.doc, 11))).toBe(true);
    expect(isBannerTableRow(tableRowAt(withAux.doc, 13))).toBe(true);
  });

  it("captures afterRow from afterRowKey before persisting", () => {
    const captured = captureTableOperationSnapshots(rtmDoc(["URS-1", "URS-2"]), {
      kind: "insert_rows",
      tableIndex: 0,
      afterRowKey: "URS-2",
      rows: [rtmRow("URS-3")],
    });
    expect(captured).toMatchObject({
      kind: "insert_rows",
      afterRow: 2,
      afterRowKey: "URS-2",
      expectedRowAtAfter: rtmRow("URS-2"),
    });
  });

  it("captures omitted expectedText and appends a column when afterCol is omitted", () => {
    const doc = tableDoc(
      ["Component", "Description"],
      [["mm", "Major release number (01, 02, etc.)"]]
    );
    const cells = captureTableOperationSnapshots(doc, {
      kind: "edit_cells",
      tableIndex: 0,
      cells: [{ row: 1, col: 1, insertText: "Major release number (e.g., 04)" }],
    });
    expect(cells).toMatchObject({
      kind: "edit_cells",
      cells: [
        {
          row: 1,
          col: 1,
          expectedText: "Major release number (01, 02, etc.)",
          insertText: "Major release number (e.g., 04)",
        },
      ],
    });
    expect(applyTableOperation(doc, cells).ok).toBe(true);

    const column = captureTableOperationSnapshots(doc, {
      kind: "insert_column",
      tableIndex: 0,
      header: "Example",
      values: ["04"],
    });
    expect(column).toMatchObject({
      kind: "insert_column",
      afterCol: 1,
      header: "Example",
      expectedHeaderAtAfterCol: "Description",
    });
    const applied = applyTableOperation(doc, column);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(colCount(applied.doc)).toBe(3);
    expect(cellText(applied.doc, 0, 2)).toBe("Example");
    expect(cellText(applied.doc, 1, 2)).toBe("04");
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

  it("inserts a Table N. caption when create_table has a title", () => {
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Intro." }],
        },
      ],
    };
    const result = applyTableOperation(
      before,
      {
        kind: "create_table",
        title: "Calibration certificates this period",
        headers: ["Instrument", "Result"],
        rows: [["TI-12", "Pass"]],
      },
      { section: "define", targetField: "narrative", existingTableCount: 3 }
    );
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    expect(result.tableNumber).toBe(4);
    expect(result.doc.content?.map((n) => n.type)).toEqual([
      "paragraph",
      "paragraph",
      "table",
    ]);
    expect(flattenForAnchor(result.doc.content![1]!).text).toBe(
      "Table 4. Calibration certificates this period"
    );
  });

  it("does not count uncaptioned table shells toward N", () => {
    expect(
      existingTableCountFromContents([
        {
          table: {
            type: "doc",
            content: [{ type: "table", content: [] }],
          },
        },
        {
          type: "doc",
          content: [{ type: "table", content: [] }],
        },
      ])
    ).toBe(0);
  });

  it("counts Table N. captions across section maps, not uncaptioned shells", () => {
    expect(
      existingTableCountFromContents([
        {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Table 7. Spare parts" }],
              },
              { type: "table", content: [] },
            ],
          },
        },
        {
          type: "doc",
          content: [{ type: "table", content: [] }],
        },
      ])
    ).toBe(7);
  });

  it("inserts a Table N. caption when a seeded table is first filled", () => {
    const result = applyTableOperation(
      seededTableDoc([...ELR_RESPONSIBILITIES_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 0, insertText: "1" },
          { row: 1, col: 1, insertText: "Production" },
          { row: 1, col: 2, insertText: "Operate the filling line" },
        ],
      },
      {
        section: "elr_responsibilities",
        targetField: "table",
        existingTableCount: 0,
      }
    );
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    expect(result.tableNumber).toBe(1);
    expect(result.doc.content?.map((n) => n.type)).toEqual(["paragraph", "table"]);
    expect(flattenForAnchor(result.doc.content![0]!).text).toBe(
      "Table 1. Departments and responsibilities"
    );
  });

  it("does not caption a still-empty seeded table", () => {
    const result = applyTableOperation(
      seededTableDoc([...ELR_RESPONSIBILITIES_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 1, insertText: "" }],
      },
      {
        section: "elr_responsibilities",
        targetField: "table",
        existingTableCount: 0,
      }
    );
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    expect(result.tableNumber).toBeUndefined();
    expect(result.doc.content?.map((n) => n.type)).toEqual(["table"]);
  });

  it("reuses an existing caption instead of inserting a second one", () => {
    const filled = applyTableOperation(
      seededTableDoc([...ELR_RESPONSIBILITIES_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 0, insertText: "1" },
          { row: 1, col: 1, insertText: "Production" },
          { row: 1, col: 2, insertText: "Operate the filling line" },
        ],
      },
      {
        section: "elr_responsibilities",
        targetField: "table",
        existingTableCount: 0,
      }
    );
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    const again = applyTableOperation(
      filled.doc,
      {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [["2", "QA", "Approve the report"]],
      },
      {
        section: "elr_responsibilities",
        targetField: "table",
        existingTableCount: 1,
      }
    );
    expect(again.status).toBe("ok");
    if (!again.ok) return;
    expect(again.tableNumber).toBe(1);
    expect(
      again.doc.content?.filter((n) => n.type === "paragraph")
    ).toHaveLength(1);
  });

  it("numbers Monitoring as Table 2 when Abbreviations already has data", () => {
    const result = applyTableOperation(
      seededTableDoc([...ELR_MONITORING_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 0, insertText: "1" },
          { row: 1, col: 1, insertText: "Viable air" },
        ],
      },
      {
        section: "elr_monitoring",
        targetField: "table",
        documentContents: [
          {
            section: "elr_abbreviations",
            content: EMPTY_ELR_CONTENT.elr_abbreviations,
          },
          {
            section: "elr_monitoring",
            content: EMPTY_ELR_CONTENT.elr_monitoring,
          },
        ],
      }
    );
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    expect(result.tableNumber).toBe(2);
    expect(flattenForAnchor(result.doc.content![0]!).text).toBe(
      "Table 2. Monitoring records"
    );
  });

  it("rewrites a stale Table 1 caption when a preceding table is filled", () => {
    const monitoring: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Table 1. Monitoring records" }],
        },
        seededTableDoc([...ELR_MONITORING_HEADERS]).content![0]!,
      ],
    };
    const filled = applyTableOperation(
      monitoring,
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 0, insertText: "1" },
          { row: 1, col: 1, insertText: "Viable air" },
        ],
      },
      {
        section: "elr_monitoring",
        targetField: "table",
        documentContents: [
          {
            section: "elr_abbreviations",
            content: EMPTY_ELR_CONTENT.elr_abbreviations,
          },
          { section: "elr_monitoring", content: { table: monitoring } },
        ],
      }
    );
    expect(filled.status).toBe("ok");
    if (!filled.ok) return;
    expect(filled.tableNumber).toBe(2);
    expect(flattenForAnchor(filled.doc.content![0]!).text).toBe(
      "Table 2. Monitoring records"
    );
  });

  it("numbers Monitoring as Table 3 when Abbreviations and Media Fill are filled", () => {
    const mediaFill = applyTableOperation(
      seededTableDoc([...ELR_RESPONSIBILITIES_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "1" }],
      },
      { section: "elr_media_fill", targetField: "table", existingTableCount: 0 }
    );
    expect(mediaFill.ok).toBe(true);
    if (!mediaFill.ok) return;
    const result = applyTableOperation(
      seededTableDoc([...ELR_MONITORING_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "1" }],
      },
      {
        section: "elr_monitoring",
        targetField: "table",
        documentContents: [
          {
            section: "elr_abbreviations",
            content: EMPTY_ELR_CONTENT.elr_abbreviations,
          },
          { section: "elr_media_fill", content: { table: mediaFill.doc } },
          {
            section: "elr_monitoring",
            content: EMPTY_ELR_CONTENT.elr_monitoring,
          },
        ],
      }
    );
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    expect(result.tableNumber).toBe(3);
    expect(
      filledTableNumberInDocument({
        contents: [
          {
            section: "elr_abbreviations",
            content: EMPTY_ELR_CONTENT.elr_abbreviations,
          },
        ],
        target: {
          section: "elr_abbreviations",
          targetField: "table",
          tableIndex: 0,
        },
      })
    ).toBe(1);
  });

  it("numbers a lone filled table as Table 1", () => {
    const result = applyTableOperation(
      seededTableDoc([...ELR_MONITORING_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "1" }],
      },
      {
        section: "elr_monitoring",
        targetField: "table",
        documentContents: [
          {
            section: "elr_monitoring",
            content: EMPTY_ELR_CONTENT.elr_monitoring,
          },
        ],
      }
    );
    expect(result.status).toBe("ok");
    if (!result.ok) return;
    expect(result.tableNumber).toBe(1);
  });

  it("bumps later captions when a table is filled mid-document", () => {
    const monitoringFilled = applyTableOperation(
      seededTableDoc([...ELR_MONITORING_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "1" }],
      },
      { section: "elr_monitoring", targetField: "table", existingTableCount: 1 }
    );
    expect(monitoringFilled.ok).toBe(true);
    if (!monitoringFilled.ok) return;
    const mediaFillFilled = applyTableOperation(
      seededTableDoc([...ELR_MEDIA_FILL_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "APS-1" }],
      },
      { section: "elr_media_fill", targetField: "table", existingTableCount: 0 }
    );
    expect(mediaFillFilled.ok).toBe(true);
    if (!mediaFillFilled.ok) return;

    const { contents, changedSections } = renumberFilledTableCaptions([
      {
        section: "elr_abbreviations",
        content: EMPTY_ELR_CONTENT.elr_abbreviations,
      },
      { section: "elr_media_fill", content: { table: mediaFillFilled.doc } },
      { section: "elr_monitoring", content: { table: monitoringFilled.doc } },
    ]);
    expect(changedSections).toContain("elr_media_fill");
    expect(changedSections).toContain("elr_monitoring");
    const mediaDoc = (contents[1]?.content as { table: JSONContent }).table;
    const monitoringDoc = (contents[2]?.content as { table: JSONContent }).table;
    expect(flattenForAnchor(mediaDoc.content![0]!).text).toBe(
      "Table 2. Media fill / aseptic process simulation"
    );
    expect(flattenForAnchor(monitoringDoc.content![0]!).text).toBe(
      "Table 3. Monitoring records"
    );
  });

  it("strips a leftover caption on an emptied grid and decrements later tables", () => {
    const monitoringFilled = applyTableOperation(
      seededTableDoc([...ELR_MONITORING_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "1" }],
      },
      { section: "elr_monitoring", targetField: "table", existingTableCount: 1 }
    );
    expect(monitoringFilled.ok).toBe(true);
    if (!monitoringFilled.ok) return;
    const emptyMedia: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Table 2. Media fill / APS" }],
        },
        seededTableDoc([...ELR_MEDIA_FILL_HEADERS]).content![0]!,
      ],
    };
    const { contents } = renumberFilledTableCaptions([
      {
        section: "elr_abbreviations",
        content: EMPTY_ELR_CONTENT.elr_abbreviations,
      },
      { section: "elr_media_fill", content: { table: emptyMedia } },
      { section: "elr_monitoring", content: { table: monitoringFilled.doc } },
    ]);
    const mediaDoc = (contents[1]?.content as { table: JSONContent }).table;
    const monitoringDoc = (contents[2]?.content as { table: JSONContent }).table;
    expect(flattenForAnchor(mediaDoc).text).not.toMatch(/Table\s+2\./i);
    expect(flattenForAnchor(monitoringDoc.content![0]!).text).toBe(
      "Table 2. Monitoring records"
    );
  });

  it("refuses create_table on a seeded ELR matrix field", () => {
    const result = applyTableOperation(
      seededTableDoc([...ELR_RESPONSIBILITIES_HEADERS]),
      { kind: "create_table", headers: ["A", "B"], title: "Extra" },
      { section: "elr_responsibilities", targetField: "table" }
    );
    expect(result.status).toBe("fixed_schema");
  });

  it("removes the caption with delete_table", () => {
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Table 1. Spare parts" }],
        },
        tableDoc(["Part", "Qty"], [["A", "2"]]).content![0]!,
      ],
    };
    const result = applyTableOperation(before, {
      kind: "delete_table",
      tableIndex: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content?.some((n) => n.type === "table")).toBe(false);
    expect(flattenForAnchor(result.doc).text).not.toMatch(/Table 1/);
  });

  it("prefixes GFM table markdown with Table N. when rewriting a filled table", () => {
    const prefixed = prefixTableCaptionMarkdown(
      "| Department | Responsibilities |\n| --- | --- |\n| Production | Operate the line |\n",
      2,
      "Departments and responsibilities"
    );
    expect(prefixed.tableNumber).toBe(3);
    expect(prefixed.markdown).toMatch(
      /^Table 3\. Departments and responsibilities\n\n\| Department/
    );
  });

  it("does not prefix GFM that already has a Table N. caption or has no data rows", () => {
    expect(
      prefixTableCaptionMarkdown(
        "Table 4. Monitoring records\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n",
        0,
        "Monitoring records"
      )
    ).toEqual({
      markdown:
        "Table 4. Monitoring records\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n",
      tableNumber: 4,
    });
    expect(
      prefixTableCaptionMarkdown(
        "Table 1. Monitoring records\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n",
        0,
        "Monitoring records",
        2
      )
    ).toEqual({
      markdown:
        "Table 2. Monitoring records\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n",
      tableNumber: 2,
    });
    expect(
      prefixTableCaptionMarkdown(
        "| A | B |\n| --- | --- |\n",
        0,
        "Monitoring records"
      )
    ).toEqual({
      markdown: "| A | B |\n| --- | --- |\n",
      tableNumber: undefined,
    });
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

  it("refuses delete_table on a seeded DV matrix field", () => {
    const result = applyTableOperation(
      seededTableDoc(["Equipment", "ID", "Calibration"]),
      { kind: "delete_table", tableIndex: 0 },
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
    expect(
      parseTableOperation({
        kind: "insert_rows",
        afterRowKey: "URS-16",
        rows: [{ banner: "ANY SPECIFIC REQUIREMENTS" }],
      })
    ).toBeUndefined();
    expect(parseTableOperation({ kind: "create_table", headers: [] })).toBeUndefined();
  });

  it("coerces Langfuse insert_rows aliases (nested array, isBanner/cells, cells matrix)", () => {
    expect(
      parseTableOperation({
        insert_rows: [
          { isBanner: true, cells: ["PROTOCOL DOCUMENTS"] },
          {
            cells: [
              "URS-GLR-1301",
              "User Requirement Specification",
              "01",
              "Draft",
              "—",
              "—",
            ],
          },
        ],
      })
    ).toEqual({
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: undefined,
      rows: [
        [
          "URS-GLR-1301",
          "User Requirement Specification",
          "01",
          "Draft",
          "—",
          "—",
        ],
      ],
      expectedRowAtAfter: undefined,
    });
    expect(
      parseTableOperation({
        kind: "insert_rows",
        rows: [
          { banner: "GROUP A" },
          [
            "URS-GLR-1301",
            "User Requirement Specification",
            "01",
            "Draft",
            "—",
            "—",
          ],
        ],
      })
    ).toEqual({
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: undefined,
      rows: [
        [
          "URS-GLR-1301",
          "User Requirement Specification",
          "01",
          "Draft",
          "—",
          "—",
        ],
      ],
      expectedRowAtAfter: undefined,
    });
    expect(
      parseTableOperation({
        kind: "insert_rows",
        tableIndex: 0,
        cells: [
          [
            "DQ-GLR-1301",
            "Design Qualification",
            "01",
            "Approved",
            "01-04-2025",
            "Complies",
          ],
        ],
      })
    ).toEqual({
      kind: "insert_rows",
      tableIndex: 0,
      afterRow: undefined,
      rows: [
        [
          "DQ-GLR-1301",
          "Design Qualification",
          "01",
          "Approved",
          "01-04-2025",
          "Complies",
        ],
      ],
      expectedRowAtAfter: undefined,
    });
  });

  it("hints insert_rows to pass rows, not cells or a nested insert_rows array", () => {
    expect(
      tableOperationInvalidHint({
        kind: "insert_rows",
        cells: [{ row: 1, col: 0, insertText: "x" }],
      })
    ).toMatch(/rows: \[\["col1","col2"\]/);
    expect(tableOperationInvalidHint({ kind: "insert_rows" })).toMatch(
      /not pass cells, \{ banner \}, or nest insert_rows/
    );
  });

  it("coerces nested edit_cells with extra reasoning and omitted expectedText", () => {
    expect(
      parseTableOperation({
        edit_cells: {
          cells: [
            {
              row: 1,
              col: 2,
              insertText: "Major release number (e.g., 04)",
            },
          ],
        },
        reasoning: "Add an example to the VCS table.",
      })
    ).toEqual({
      kind: "edit_cells",
      tableIndex: 0,
      cells: [
        {
          row: 1,
          col: 2,
          insertText: "Major release number (e.g., 04)",
        },
      ],
    });
  });

  it("coerces add_column aliases and omits afterCol to append", () => {
    expect(
      parseTableOperation({
        add_column: {
          header: "Example",
          values: ["04", "07", "01", "1011"],
        },
      })
    ).toEqual({
      kind: "insert_column",
      tableIndex: 0,
      afterCol: undefined,
      header: "Example",
      values: ["04", "07", "01", "1011"],
      expectedHeaderAtAfterCol: undefined,
      expectedHeaders: undefined,
    });
  });

  it("coerces insert_column headers array to the new header", () => {
    expect(
      parseTableOperation({
        kind: "insert_column",
        headers: ["Component", "Description", "Example"],
        values: ["04", "08", "01", "1011"],
      })
    ).toEqual({
      kind: "insert_column",
      tableIndex: 0,
      afterCol: undefined,
      header: "Example",
      values: ["04", "08", "01", "1011"],
      expectedHeaderAtAfterCol: undefined,
      expectedHeaders: undefined,
    });
  });

  it("coerces stringified create_table rows and extra reasoning", () => {
    expect(
      parseTableOperation({
        create_table: {
          headers: ["Component", "Designation", "Description"],
          rows: [
            "['mm', 'Major', 'Major release number (01, 02, etc.)'],",
            "['nn', 'Minor', 'Minor release number (01, 02, etc.)'],",
            ["ff", "Fix", "Fix release number (01, 02, etc.)"],
          ],
        },
        reasoning: "Add a VCS table",
      })
    ).toEqual({
      kind: "create_table",
      headers: ["Component", "Designation", "Description"],
      rows: [
        ["mm", "Major", "Major release number (01, 02, etc.)"],
        ["nn", "Minor", "Minor release number (01, 02, etc.)"],
        ["ff", "Fix", "Fix release number (01, 02, etc.)"],
      ],
    });
  });

  it("coerces a single edit_cells object with a value alias", () => {
    expect(
      parseTableOperation({
        kind: "edit_cells",
        row: 1,
        col: 2,
        value: "Major release number (e.g., 04)",
      })
    ).toEqual({
      kind: "edit_cells",
      tableIndex: 0,
      cells: [
        {
          row: 1,
          col: 2,
          insertText: "Major release number (e.g., 04)",
        },
      ],
    });
  });

  it("coerces near-miss delete_table / delete_rows shapes", () => {
    expect(
      parseTableOperation({
        tableIndex: 0,
        operation: "delete_rows",
        toRow: 4,
      })
    ).toEqual({
      kind: "delete_rows",
      tableIndex: 0,
      rows: [
        { row: 1, expectedCells: [] },
        { row: 2, expectedCells: [] },
        { row: 3, expectedCells: [] },
        { row: 4, expectedCells: [] },
      ],
    });
    expect(
      parseTableOperation({
        kind: "delete_rows",
        tableIndex: 0,
        rows: [1, 2, 3, 4],
      })
    ).toEqual({
      kind: "delete_rows",
      tableIndex: 0,
      rows: [
        { row: 1, expectedCells: [] },
        { row: 2, expectedCells: [] },
        { row: 3, expectedCells: [] },
        { row: 4, expectedCells: [] },
      ],
    });
    expect(
      parseTableOperation({
        kind: "delete_rows",
        fromRow: 1,
        toRow: 4,
      })
    ).toMatchObject({ kind: "delete_rows", tableIndex: 0 });
    expect(parseTableOperation({ kind: "delete_table" })).toEqual({
      kind: "delete_table",
      tableIndex: 0,
    });
    expect(parseTableOperation({ kind: "remove_table", tableIndex: 0 })).toEqual({
      kind: "delete_table",
      tableIndex: 0,
    });
  });

  it("coerces nested create_table { create_table: { headers, rows } }", () => {
    expect(
      parseTableOperation({
        create_table: {
          headers: ["Component", "Description"],
          rows: [
            ["mm", "represents major release number (01, 02, etc.)"],
            ["nn", "represents minor release number (01, 02, etc.)"],
          ],
          afterAnchor: "mm.nn.ff.bb, where:",
        },
      })
    ).toEqual({
      kind: "create_table",
      headers: ["Component", "Description"],
      rows: [
        ["mm", "represents major release number (01, 02, etc.)"],
        ["nn", "represents minor release number (01, 02, etc.)"],
      ],
      afterAnchor: "mm.nn.ff.bb, where:",
    });
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

  it("preserves create_table title", () => {
    expect(
      parseTableOperation({
        kind: "create_table",
        title: "Calibration certificates this period",
        headers: ["Instrument", "Result"],
        rows: [["TI-12", "Pass"]],
      })
    ).toEqual({
      kind: "create_table",
      title: "Calibration certificates this period",
      headers: ["Instrument", "Result"],
      rows: [["TI-12", "Pass"]],
    });
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

  it("describes deleting a table", () => {
    expect(
      summarizeTableOperation({ kind: "delete_table", tableIndex: 0 })
    ).toBe("Delete table");
  });
});
