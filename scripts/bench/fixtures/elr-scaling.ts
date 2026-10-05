/**
 * Synthetic ELR sections for offline table-ref benchmarks (matches table-ref-scaling.test).
 */
import type { JSONContent } from "@tiptap/core";
import { EMPTY_ELR_CONTENT } from "@/lib/document-types/elr/sections";
import type { TableNumberComment } from "@/lib/suggestions/document-table-number";

function table(dataRows: string[]): JSONContent {
  const row = (type: string, text: string): JSONContent => ({
    type: "tableRow",
    content: [0, 1].map(() => ({
      type,
      content: [
        { type: "paragraph", content: text ? [{ type: "text", text }] : [] },
      ],
    })),
  });
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          row("tableHeader", "Header"),
          ...dataRows.map((text) => row("tableCell", text)),
        ],
      },
    ],
  };
}

/** Every ELR section; each `table` field alternately filled and empty. */
export function syntheticElrSections(): Record<string, unknown> {
  const sections: Record<string, unknown> = {};
  Object.entries(EMPTY_ELR_CONTENT).forEach(([key, empty], index) => {
    const content = empty as Record<string, unknown>;
    sections[key] =
      content.table === undefined
        ? content
        : { ...content, table: table(index % 2 === 0 ? ["filled"] : [""]) };
  });
  return sections;
}

export function insertRowsSuggestionComment(
  id: string,
  section: string
): TableNumberComment {
  return {
    id,
    section: section as TableNumberComment["section"],
    contentPath: "table",
    status: "open",
    kind: "ai_fix",
    createdAt: new Date(1_700_000_000_000 + Number(id)).toISOString(),
    content: JSON.stringify({
      criterionKey: "k",
      targetField: "table",
      tableOperation: {
        kind: "insert_rows",
        rows: [{ cells: [`row ${id}`, "value"] }],
      },
    }),
  };
}

export function openInsertRowsComments(
  count: number,
  section = "elr_access_control"
): TableNumberComment[] {
  return Array.from({ length: count }, (_, i) =>
    insertRowsSuggestionComment(String(i + 1), section)
  );
}
