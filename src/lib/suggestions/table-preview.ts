import type { JSONContent } from "@tiptap/core";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  applyTableOperation,
  cellPlainText,
  normalizeTableCellText,
  type TableCellEdit,
  type TableOperation,
  type TableOperationContext,
  type TableOperationResult,
} from "@/lib/suggestions/table-operation";
import type { RedraftPreviewAttrs } from "@/lib/tiptap/redraft-preview";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

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

export type CellDiffKind = "equal" | "delete" | "insert";

export type CellDiffRun = {
  kind: CellDiffKind;
  text: string;
};

/**
 * Ignore short coincidental overlaps (" / ", "S/N") so a real replace stays
 * one delete + one insert. Long enough to keep a serial or model number.
 */
const MIN_SHARED_INFIX = 6;

/** Longest shared prefix and suffix so only the changed span is marked. */
export function prefixSuffixDiff(
  before: string,
  after: string
): { prefix: string; deleted: string; inserted: string; suffix: string } {
  let start = 0;
  const shared = Math.min(before.length, after.length);
  while (start < shared && before[start] === after[start]) start += 1;

  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore -= 1;
    endAfter -= 1;
  }

  return {
    prefix: before.slice(0, start),
    deleted: before.slice(start, endBefore),
    inserted: after.slice(start, endAfter),
    suffix: before.slice(endBefore),
  };
}

function longestCommonSubstring(
  a: string,
  b: string
): { aStart: number; bStart: number; length: number } {
  let best = { aStart: 0, bStart: 0, length: 0 };
  if (!a || !b) return best;

  let prev = new Array<number>(b.length + 1).fill(0);
  let curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        const len = prev[j - 1]! + 1;
        curr[j] = len;
        if (len > best.length) {
          best = { aStart: i - len, bStart: j - len, length: len };
        }
      } else {
        curr[j] = 0;
      }
    }
    const swap = prev;
    prev = curr;
    curr = swap;
    curr.fill(0);
  }

  return best;
}

function mergeAdjacentRuns(runs: CellDiffRun[]): CellDiffRun[] {
  const out: CellDiffRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = out[out.length - 1];
    if (last && last.kind === run.kind) {
      last.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  return out;
}

function diffRange(before: string, after: string): CellDiffRun[] {
  if (before === after) {
    return before ? [{ kind: "equal", text: before }] : [];
  }
  if (!before) return [{ kind: "insert", text: after }];
  if (!after) return [{ kind: "delete", text: before }];

  const { prefix, deleted, inserted, suffix } = prefixSuffixDiff(before, after);
  if (prefix || suffix) {
    return [
      ...(prefix ? [{ kind: "equal" as const, text: prefix }] : []),
      ...diffRange(deleted, inserted),
      ...(suffix ? [{ kind: "equal" as const, text: suffix }] : []),
    ];
  }

  const shared = longestCommonSubstring(before, after);
  if (shared.length >= MIN_SHARED_INFIX) {
    const sharedText = before.slice(
      shared.aStart,
      shared.aStart + shared.length
    );
    return [
      ...diffRange(before.slice(0, shared.aStart), after.slice(0, shared.bStart)),
      { kind: "equal", text: sharedText },
      ...diffRange(
        before.slice(shared.aStart + shared.length),
        after.slice(shared.bStart + shared.length)
      ),
    ];
  }

  return [
    { kind: "delete", text: before },
    { kind: "insert", text: after },
  ];
}

/**
 * Track-change runs for a cell: keep a shared middle (serial, model no.)
 * unmarked instead of striking it and typing it again.
 */
export function cellTextDiff(before: string, after: string): CellDiffRun[] {
  return mergeAdjacentRuns(diffRange(before, after));
}

function markedRun(
  text: string,
  markName: string | null,
  attrs: RedraftPreviewAttrs
): JSONContent | null {
  if (!text) return null;
  return {
    type: "text",
    text,
    marks: markName ? [{ type: markName, attrs: { ...attrs } }] : undefined,
  };
}

function paintCellEditPreview(
  cell: JSONContent,
  edit: TableCellEdit,
  attrs: RedraftPreviewAttrs
): void {
  const before = cellPlainText(cell);
  const after = normalizeTableCellText(
    normalizeSuggestionInsertText(edit.insertText)
  );
  const content = cellTextDiff(before, after)
    .map((run) => {
      const markName =
        run.kind === "delete"
          ? suggestionDeleteMarkName
          : run.kind === "insert"
            ? suggestionInsertMarkName
            : null;
      return markedRun(run.text, markName, attrs);
    })
    .filter((node): node is JSONContent => node !== null);

  cell.content = [
    {
      type: "paragraph",
      content: content.length ? content : undefined,
    },
  ];
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

  if (operation.kind === "create_table") {
    const created = collectTables(applied.doc).at(-1);
    if (!created) return applied;
    const createdRows = tableRows(created);
    markRows(
      createdRows,
      createdRows.map((_, i) => i),
      suggestionInsertMarkName,
      attrs
    );
    return applied;
  }

  const table = collectTables(applied.doc)[operation.tableIndex];
  if (!table) return applied;
  const rows = tableRows(table);

  switch (operation.kind) {
    case "edit_cells": {
      const preview = structuredClone(doc);
      const originalTable = collectTables(preview)[operation.tableIndex];
      if (!originalTable) return applied;
      const originalRows = tableRows(originalTable);
      for (const cell of operation.cells) {
        const node = rowCells(originalRows[cell.row] ?? {})[cell.col];
        if (node) paintCellEditPreview(node, cell, attrs);
      }
      return { ok: true, status: "ok", doc: preview };
    }
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
