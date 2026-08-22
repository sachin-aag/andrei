import type { JSONContent } from "@tiptap/core";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import type { RedraftPreviewAttrs } from "@/lib/tiptap/redraft-preview";
import {
  applyTableOperation,
  type TableOperation,
  type TableOperationContext,
  type TableOperationResult,
} from "@/lib/suggestions/table-operation";

function collectTables(doc: JSONContent): JSONContent[] {
  const tables: JSONContent[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "table") {
      tables.push(node);
      return;
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return tables;
}

function tableRows(table: JSONContent): JSONContent[] {
  return (table.content ?? []).filter((node) => node.type === "tableRow");
}

function rowCells(row: JSONContent): JSONContent[] {
  return (row.content ?? []).filter(
    (node) => node.type === "tableCell" || node.type === "tableHeader"
  );
}

function markAllText(
  node: JSONContent,
  markName: string,
  attrs: RedraftPreviewAttrs
): void {
  if (node.type === "text") {
    node.marks = [...(node.marks ?? []), { type: markName, attrs: { ...attrs } }];
    return;
  }
  if (
    (node.type === "paragraph" || node.type === "heading") &&
    !node.content?.length
  ) {
    node.content = [
      {
        type: "text",
        text: "\u00a0",
        marks: [{ type: markName, attrs: { ...attrs } }],
      },
    ];
    return;
  }
  node.content?.forEach((child) => markAllText(child, markName, attrs));
}

function markRows(
  rows: JSONContent[],
  indexes: readonly number[],
  markName: string,
  attrs: RedraftPreviewAttrs
): void {
  for (const index of indexes) {
    const row = rows[index];
    if (row) markAllText(row, markName, attrs);
  }
}

function markColumn(
  rows: JSONContent[],
  col: number,
  markName: string,
  attrs: RedraftPreviewAttrs
): void {
  for (const row of rows) {
    const cell = rowCells(row)[col];
    if (cell) markAllText(cell, markName, attrs);
  }
}

/**
 * Apply a table operation for in-editor preview and paint the changed
 * cells with the same insert/delete marks used for prose suggestions.
 */
export function buildTableOperationPreviewDoc(
  doc: JSONContent,
  operation: TableOperation,
  attrs: RedraftPreviewAttrs,
  context?: TableOperationContext
): TableOperationResult {
  if (operation.kind === "delete_rows" || operation.kind === "delete_column") {
    const probe = applyTableOperation(doc, operation, context);
    if (!probe.ok) return probe;
    const preview = structuredClone(doc);
    const table = collectTables(preview)[operation.tableIndex];
    if (!table) return probe;
    const rows = tableRows(table);
    if (operation.kind === "delete_rows") {
      markRows(
        rows,
        operation.rows.map((target) => target.row),
        suggestionDeleteMarkName,
        attrs
      );
    } else {
      markColumn(rows, operation.col, suggestionDeleteMarkName, attrs);
    }
    return { ok: true, status: "ok", doc: preview };
  }

  const applied = applyTableOperation(doc, operation, context);
  if (!applied.ok) return applied;

  const table = collectTables(applied.doc)[operation.tableIndex];
  if (!table) return applied;
  const rows = tableRows(table);

  switch (operation.kind) {
    case "edit_cells":
      for (const cell of operation.cells) {
        const node = rowCells(rows[cell.row] ?? {})[cell.col];
        if (node) markAllText(node, suggestionInsertMarkName, attrs);
      }
      return applied;
    case "insert_rows": {
      const afterRow = operation.afterRow ?? 0;
      const inserted = operation.rows.map((_, i) => afterRow + 1 + i);
      markRows(rows, inserted, suggestionInsertMarkName, attrs);
      return applied;
    }
    case "insert_column": {
      const col = operation.afterCol + 1;
      markColumn(rows, col, suggestionInsertMarkName, attrs);
      return applied;
    }
    default: {
      const _exhaustive: never = operation;
      return _exhaustive;
    }
  }
}
