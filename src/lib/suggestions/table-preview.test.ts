import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { buildTableOperationPreviewDoc } from "@/lib/suggestions/table-preview";
import { suggestionInsertMarkName } from "@/lib/tiptap/suggestion-marks";

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
});
