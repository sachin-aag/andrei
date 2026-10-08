import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import {
  CVP_EXTRANEOUS_RESULTS_HEADERS,
  CVP_SHELL_CALC_HEADERS,
} from "@/lib/document-types/cvp/sections";
import {
  buildTableOperationPreviewDoc,
  cellTextDiff,
  createdTableIndex,
  prefixSuffixDiff,
} from "@/lib/suggestions/table-preview";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

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

const PREVIEW_ATTRS = {
  id: "sug-1",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-08-22T00:00:00.000Z",
  kind: "fix" as const,
};

it("previews a cell list as list items, not one paragraph", () => {
  const doc = tableDoc(["Department", "Responsibility"], [["Quality Assurance", ""]]);
  const result = buildTableOperationPreviewDoc(
    doc,
    {
      kind: "edit_cells",
      tableIndex: 0,
      cells: [
        {
          row: 1,
          col: 1,
          expectedText: "",
          insertText:
            "- Preparation and review of the protocol.\n- Collection of swab samples.",
        },
      ],
    },
    PREVIEW_ATTRS
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const table = (result.doc.content ?? []).find((node) => node.type === "table")!;
  const rows = (table.content ?? []).filter((node) => node.type === "tableRow");
  const cell = (rows[1]!.content ?? []).filter(
    (node) => node.type === "tableCell"
  )[1]!;
  expect(cell.content?.some((node) => node.type === "bulletList")).toBe(true);
  expect(JSON.stringify(cell)).toContain(suggestionInsertMarkName);
  expect(JSON.stringify(cell)).toContain("Collection of swab samples.");
});

function rowHasInsertMark(doc: JSONContent, row: number): boolean {
  const table = (doc.content ?? []).find((n) => n.type === "table");
  const rows = (table?.content ?? []).filter((n) => n.type === "tableRow");
  const blob = JSON.stringify(rows[row]);
  return blob.includes(suggestionInsertMarkName);
}

function cellText(doc: JSONContent, row: number, col: number): string {
  const table = (doc.content ?? []).find((n) => n.type === "table")!;
  const rows = (table.content ?? []).filter((n) => n.type === "tableRow");
  const cells = (rows[row]!.content ?? []).filter(
    (n) => n.type === "tableCell" || n.type === "tableHeader"
  );
  return flattenForAnchor(cells[col]!).text.replace(/\s+/g, " ").trim();
}

function cellRuns(
  doc: JSONContent,
  row: number,
  col: number
): Array<{ text: string; insert: boolean; deleted: boolean }> {
  const table = (doc.content ?? []).find((n) => n.type === "table")!;
  const rows = (table.content ?? []).filter((n) => n.type === "tableRow");
  const cells = (rows[row]!.content ?? []).filter(
    (n) => n.type === "tableCell" || n.type === "tableHeader"
  );
  const runs: Array<{ text: string; insert: boolean; deleted: boolean }> = [];
  const walk = (node: JSONContent) => {
    if (node.type === "text" && node.text) {
      const marks = node.marks ?? [];
      runs.push({
        text: node.text,
        insert: marks.some((m) => m.type === suggestionInsertMarkName),
        deleted: marks.some((m) => m.type === suggestionDeleteMarkName),
      });
      return;
    }
    node.content?.forEach(walk);
  };
  walk(cells[col]!);
  return runs;
}

describe("buildTableOperationPreviewDoc", () => {
  it("marks inserted rows with suggestion insert marks", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(["H1", "H2"], [["first", "row"]]),
      {
        kind: "insert_rows",
        tableIndex: 0,
        afterRow: 0,
        rows: [["Solea", "0300650"]],
      },
      PREVIEW_ATTRS
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(cellText(preview.doc, 1, 0)).toBe("Solea");
    expect(rowHasInsertMark(preview.doc, 0)).toBe(false);
    expect(rowHasInsertMark(preview.doc, 1)).toBe(true);
    expect(rowHasInsertMark(preview.doc, 2)).toBe(false);
  });

  it("marks rows inserted by afterRowKey, not a stale afterRow", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(["H1", "H2"], [["first", "row"], ["second", "row"]]),
      {
        kind: "insert_rows",
        tableIndex: 0,
        afterRow: 0,
        afterRowKey: "second",
        rows: [["third", "row"]],
      },
      PREVIEW_ATTRS
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(cellText(preview.doc, 3, 0)).toBe("third");
    expect(rowHasInsertMark(preview.doc, 2)).toBe(false);
    expect(rowHasInsertMark(preview.doc, 3)).toBe(true);
  });

  it("paints edit_cells on the rematched URS-13 row, not a stale numeric row", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(
        ["URS ID", "Stage"],
        [
          ["URS-1", ""],
          ["URS-8", ""],
          ["URS-13", ""],
        ]
      ),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 1,
            rowKey: "URS-13",
            expectedText: "",
            insertText: "PQ",
          },
        ],
      },
      PREVIEW_ATTRS
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(cellRuns(preview.doc, 1, 1)).toEqual([]);
    expect(cellRuns(preview.doc, 3, 1)).toEqual([
      { text: "PQ", insert: true, deleted: false },
    ]);
    expect(rowHasInsertMark(preview.doc, 1)).toBe(false);
    expect(rowHasInsertMark(preview.doc, 3)).toBe(true);
  });

  it("paints each rowKey on its own URS when the dummy numeric row is reused", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(
        ["URS ID", "Stage", "Section"],
        [
          ["URS-1", "", ""],
          ["URS-13", "", ""],
          ["URS-64", "", ""],
        ]
      ),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 1,
            rowKey: "URS-13",
            expectedText: "",
            insertText: "IQ",
          },
          {
            row: 1,
            col: 2,
            rowKey: "URS-13",
            expectedText: "",
            insertText: "13.3.5.1",
          },
          {
            row: 1,
            col: 1,
            rowKey: "URS-64",
            expectedText: "",
            insertText: "IQ",
          },
          {
            row: 1,
            col: 2,
            rowKey: "URS-64",
            expectedText: "",
            insertText: "13.2",
          },
        ],
      },
      PREVIEW_ATTRS
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(cellRuns(preview.doc, 1, 1)).toEqual([]);
    expect(cellRuns(preview.doc, 1, 2)).toEqual([]);
    expect(cellRuns(preview.doc, 2, 1)).toEqual([
      { text: "IQ", insert: true, deleted: false },
    ]);
    expect(cellRuns(preview.doc, 2, 2)).toEqual([
      { text: "13.3.5.1", insert: true, deleted: false },
    ]);
    expect(cellRuns(preview.doc, 3, 1)).toEqual([
      { text: "IQ", insert: true, deleted: false },
    ]);
    expect(cellRuns(preview.doc, 3, 2)).toEqual([
      { text: "13.2", insert: true, deleted: false },
    ]);
  });

  it("paints empty remainder cells when a dummy-row sibling is already filled", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(
        ["URS ID", "Stage", "Section"],
        [
          ["URS-1", "PQ [28]", ""],
          ["URS-13", "", ""],
          ["URS-64", "", ""],
        ]
      ),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 1,
            rowKey: "URS-1",
            expectedText: "",
            insertText: "IQ",
          },
          {
            row: 1,
            col: 1,
            rowKey: "URS-13",
            expectedText: "",
            insertText: "IQ",
          },
          {
            row: 1,
            col: 1,
            rowKey: "URS-64",
            expectedText: "",
            insertText: "IQ",
          },
        ],
      },
      PREVIEW_ATTRS
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(cellRuns(preview.doc, 1, 1)).toEqual([
      { text: "PQ [28]", insert: false, deleted: false },
    ]);
    expect(cellRuns(preview.doc, 2, 1)).toEqual([
      { text: "IQ", insert: true, deleted: false },
    ]);
    expect(cellRuns(preview.doc, 3, 1)).toEqual([
      { text: "IQ", insert: true, deleted: false },
    ]);
  });

  it("marks only the added suffix on edit_cells, not the original cell text", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(
        ["Equipment"],
        [["Solea Dental Laser System"], ["Solea Dental Laser System"]]
      ),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 0,
            expectedText: "Solea Dental Laser System",
            insertText: "Solea Dental Laser System (UUT 1)",
          },
          {
            row: 2,
            col: 0,
            expectedText: "Solea Dental Laser System",
            insertText: "Solea Dental Laser System (UUT 2)",
          },
        ],
      },
      PREVIEW_ATTRS
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(cellRuns(preview.doc, 1, 0)).toEqual([
      { text: "Solea Dental Laser System", insert: false, deleted: false },
      { text: " (UUT 1)", insert: true, deleted: false },
    ]);
    expect(cellRuns(preview.doc, 2, 0)).toEqual([
      { text: "Solea Dental Laser System", insert: false, deleted: false },
      { text: " (UUT 2)", insert: true, deleted: false },
    ]);
    expect(rowHasInsertMark(preview.doc, 0)).toBe(false);
  });

  it("strikes replaced text and greens the replacement", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(["Model"], [["Model 3 (TOP-00017)"]]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 0,
            expectedText: "Model 3 (TOP-00017)",
            insertText: "Model 4 (TOP-00017)",
          },
        ],
      },
      PREVIEW_ATTRS
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(cellRuns(preview.doc, 1, 0)).toEqual([
      { text: "Model ", insert: false, deleted: false },
      { text: "3", insert: false, deleted: true },
      { text: "4", insert: true, deleted: false },
      { text: " (TOP-00017)", insert: false, deleted: false },
    ]);
  });

  it("keeps a shared serial unmarked when wrapping it with a prefix and suffix", () => {
    const serial = "TOP-00017 / S/N: 0300650";
    const preview = buildTableOperationPreviewDoc(
      tableDoc(
        ["Equipment", "Serial"],
        [["Solea Dental Laser System", serial]]
      ),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 1,
            expectedText: serial,
            insertText: `UUT 1 / ${serial} [Appendix B DV Report.pdf, p. 32]`,
          },
        ],
      },
      PREVIEW_ATTRS
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(cellRuns(preview.doc, 1, 0)).toEqual([
      { text: "Solea Dental Laser System", insert: false, deleted: false },
    ]);
    expect(cellRuns(preview.doc, 1, 1)).toEqual([
      { text: "UUT 1 / ", insert: true, deleted: false },
      { text: serial, insert: false, deleted: false },
      {
        text: " [Appendix B DV Report.pdf, p. 32]",
        insert: true,
        deleted: false,
      },
    ]);
  });

  it("marks every cell of a newly created table", () => {
    const preview = buildTableOperationPreviewDoc(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Intro." }],
          },
        ],
      },
      {
        kind: "create_table",
        headers: ["Req", "Result"],
        rows: [["SW-1", "Pass"]],
      },
      PREVIEW_ATTRS
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.doc.content?.map((n) => n.type)).toEqual(["paragraph", "table"]);
    expect(JSON.stringify(preview.doc.content?.[0])).not.toContain(
      suggestionInsertMarkName
    );
    expect(rowHasInsertMark(preview.doc, 0)).toBe(true);
    expect(rowHasInsertMark(preview.doc, 1)).toBe(true);
    expect(cellText(preview.doc, 0, 0)).toBe("Req");
    expect(cellText(preview.doc, 1, 1)).toBe("Pass");
  });

  it("marks the afterAnchor table, not a later existing 15.N.8 grid", () => {
    const heading = "15.2.3.2 Calculation for shell wall swab locations";
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "15.2 MIXED VESSEL (MV-1304)" }],
        },
        tableDoc(["Parameter", "Details", "Source"], [["Capacity", "10k L", "IQ"]])
          .content![0]!,
        {
          type: "heading",
          attrs: { level: 4 },
          content: [{ type: "text", text: heading }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The number of shell wall swab sampling locations shall be determined from the vessel.",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [
            {
              type: "text",
              text: "15.2.8 Rinse samples analysis results summary (Extraneous matter)",
            },
          ],
        },
        tableDoc(
          [...CVP_EXTRANEOUS_RESULTS_HEADERS],
          [
            ["Rinse Sample", "NA", ""],
            ["Limit", "Black and fiber particles should be absent", ""],
          ]
        ).content![0]!,
      ],
    };
    const operation = {
      kind: "create_table" as const,
      headers: [...CVP_SHELL_CALC_HEADERS],
      rows: [["H", "NA", "3.9 m", "Shell height"]],
      afterAnchor: heading,
      title: "Shell wall swab sampling locations",
    };
    const preview = buildTableOperationPreviewDoc(
      before,
      operation,
      PREVIEW_ATTRS
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const types = preview.doc.content?.map((n) => n.type) ?? [];
    expect(types).toEqual([
      "heading",
      "table",
      "heading",
      "paragraph",
      "table",
      "paragraph",
      "heading",
      "table",
    ]);
    expect(createdTableIndex(before, preview.doc)).toBe(1);

    const tables = (preview.doc.content ?? []).filter((n) => n.type === "table");
    expect(flattenForAnchor(tables[0]!).text).toContain("Capacity");
    expect(JSON.stringify(tables[0])).not.toContain(suggestionInsertMarkName);

    expect(flattenForAnchor(tables[1]!).text).toContain("Parameter");
    expect(flattenForAnchor(tables[1]!).text).toContain("3.9 m");
    expect(JSON.stringify(tables[1])).toContain(suggestionInsertMarkName);

    expect(flattenForAnchor(tables[2]!).text).toContain("Rinse Sample");
    expect(JSON.stringify(tables[2])).not.toContain(suggestionInsertMarkName);

    const caption = preview.doc.content?.[3];
    expect(caption?.type).toBe("paragraph");
    expect(flattenForAnchor(caption!).text).toMatch(
      /^Table \d+\. Shell wall swab sampling locations/
    );
    expect(JSON.stringify(caption)).toContain(suggestionInsertMarkName);
  });

  it("marks every row of a deleted table without removing it from preview", () => {
    const preview = buildTableOperationPreviewDoc(
      tableDoc(["H"], [["a"], ["b"]]),
      { kind: "delete_table", tableIndex: 0 },
      PREVIEW_ATTRS
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.doc.content?.some((node) => node.type === "table")).toBe(true);
    expect(JSON.stringify(preview.doc)).toContain(suggestionDeleteMarkName);
    expect(cellText(preview.doc, 0, 0)).toBe("H");
    expect(cellText(preview.doc, 2, 0)).toBe("b");
  });
});

describe("prefixSuffixDiff", () => {
  it("isolates a trailing addition", () => {
    expect(
      prefixSuffixDiff(
        "Solea Dental Laser System",
        "Solea Dental Laser System (UUT 1)"
      )
    ).toEqual({
      prefix: "Solea Dental Laser System",
      deleted: "",
      inserted: " (UUT 1)",
      suffix: "",
    });
  });
});

describe("cellTextDiff", () => {
  it("keeps a shared middle unmarked when adding a prefix and suffix", () => {
    const serial = "TOP-00017 / S/N: 0300650";
    expect(
      cellTextDiff(
        serial,
        `UUT 1 / ${serial} [Appendix B DV Report.pdf, p. 32]`
      )
    ).toEqual([
      { kind: "insert", text: "UUT 1 / " },
      { kind: "equal", text: serial },
      { kind: "insert", text: " [Appendix B DV Report.pdf, p. 32]" },
    ]);
  });

  it("does not split a replace on a short coincidental overlap", () => {
    expect(cellTextDiff("AAA / BBB", "CCC / DDD")).toEqual([
      { kind: "delete", text: "AAA / BBB" },
      { kind: "insert", text: "CCC / DDD" },
    ]);
  });
});
