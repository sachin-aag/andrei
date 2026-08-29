import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import {
  buildTableOperationPreviewDoc,
  cellTextDiff,
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
