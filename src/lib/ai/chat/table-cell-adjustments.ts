import type { TableOperation } from "@/lib/suggestions/table-operation";

export type TableCellAdjustment = {
  rowKey?: string;
  row: number;
  col: number;
  column?: string;
  requested: string;
  saved: string;
};

/** Rows the suggestion card actually holds vs what the model asked for. */
export type TableEditProposalMeta = {
  requestedCellCount: number;
  proposedCellCount: number;
  requestedRowKeys: string[];
  proposedRowKeys: string[];
  droppedRowKeys: string[];
};

const MAX_ADJUSTMENTS = 24;
const MAX_NAMED_KEYS = 12;

function normalized(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Server-attached `[file, p. N]` / `[n]` brackets are not a content change. */
function withoutCitations(text: string | undefined): string {
  return normalized((text ?? "").replace(/\[[^\]]*\]/g, " "));
}

function differs(want: string, got: string): boolean {
  return withoutCitations(want) !== withoutCitations(got);
}

function rowKeyOf(row: readonly string[]): string | undefined {
  const first = withoutCitations(row[0]);
  return first || undefined;
}

function rowGridAdjustments(
  requested: readonly string[][],
  saved: readonly string[][],
  columnLabel: (col: number) => string | null
): TableCellAdjustment[] {
  const out: TableCellAdjustment[] = [];
  requested.forEach((row, rowIndex) => {
    const savedRow = saved[rowIndex] ?? [];
    row.forEach((cell, col) => {
      const want = normalized(cell);
      const got = normalized(savedRow[col]);
      if (!want || !differs(want, got)) return;
      out.push({
        rowKey: rowKeyOf(savedRow.length > 0 ? savedRow : row),
        row: rowIndex,
        col,
        column: columnLabel(col) ?? undefined,
        requested: want,
        saved: got,
      });
    });
  });
  return out;
}

/**
 * Cells whose saved text differs from what the model asked for (grounding
 * cleared unsupported Remarks, ranked Stage up to PQ, dropped a leftover
 * placeholder). The tool result lists them so the wrap-up reports what
 * landed instead of echoing the request.
 */
export function tableCellAdjustments(
  requested: TableOperation,
  saved: TableOperation,
  columnLabel: (col: number) => string | null = () => null
): TableCellAdjustment[] {
  let out: TableCellAdjustment[] = [];
  if (requested.kind === "edit_cells" && saved.kind === "edit_cells") {
    const cellKey = (cell: { row: number; col: number; rowKey?: string }) =>
      `${normalized(cell.rowKey) || `#${cell.row}`}:${cell.col}`;
    const savedByKey = new Map(saved.cells.map((cell) => [cellKey(cell), cell]));
    for (const cell of requested.cells) {
      const want = normalized(cell.insertText);
      const got = normalized(savedByKey.get(cellKey(cell))?.insertText);
      if (!want || !differs(want, got)) continue;
      out.push({
        ...(cell.rowKey ? { rowKey: cell.rowKey } : {}),
        row: cell.row,
        col: cell.col,
        column: columnLabel(cell.col) ?? undefined,
        requested: want,
        saved: got,
      });
    }
  } else if (
    (requested.kind === "insert_rows" && saved.kind === "insert_rows") ||
    (requested.kind === "create_table" && saved.kind === "create_table")
  ) {
    out = rowGridAdjustments(
      requested.rows ?? [],
      saved.rows ?? [],
      columnLabel
    );
  }
  return out.slice(0, MAX_ADJUSTMENTS);
}

export function tableCellAdjustmentsMessage(
  adjustments: readonly TableCellAdjustment[]
): string {
  const blanks = adjustments.filter((adj) => !adj.saved);
  const changed = adjustments.length - blanks.length;
  const parts = [
    blanks.length > 0 ? `${blanks.length} requested cell(s) were saved empty` : "",
    changed > 0 ? `${changed} were saved with different text` : "",
  ].filter(Boolean);
  const named = blanks
    .slice(0, 8)
    .map((adj) => [adj.rowKey, adj.column].filter(Boolean).join(" "))
    .filter(Boolean);
  const blankList =
    named.length > 0
      ? ` Left blank: ${named.join("; ")}${blanks.length > named.length ? "…" : ""}.`
      : "";
  const kept = adjustments.filter((adj) => adj.saved);
  const keptKeys = [
    ...new Set(kept.map((adj) => adj.rowKey).filter(Boolean)),
  ];
  const keptNote =
    keptKeys.length > 0
      ? ` Non-empty saved replacements landed on ${keptKeys.slice(0, 8).join(", ")}${keptKeys.length > 8 ? "…" : ""} only — do not list requested URS rows whose saved Section is empty.`
      : "";
  return `${parts.join(" and ")} because the retrieved pages did not support the requested value.${blankList}${keptNote} Report the saved values in adjustedCells, not the requested ones; do not claim an empty cell was filled. Do not paste a markdown table of requested RTM rows in chat.`;
}

function uniqueKeys(keys: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keys) {
    const key = normalized(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function formatKeys(keys: readonly string[]): string {
  if (keys.length === 0) return "(none)";
  const shown = keys.slice(0, MAX_NAMED_KEYS);
  const extra = keys.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} (+${extra} more)` : shown.join(", ");
}

function operationCellCount(operation: TableOperation): number {
  switch (operation.kind) {
    case "edit_cells":
      return operation.cells.length;
    case "insert_rows":
      return operation.rows.length;
    case "create_table":
      return (operation.rows ?? []).length;
    case "delete_rows":
      return operation.rows.length;
    case "insert_column":
      return (operation.values ?? []).filter((value) => normalized(value)).length;
    case "delete_column":
    case "delete_table":
      return 1;
    default: {
      const _exhaustive: never = operation;
      return _exhaustive;
    }
  }
}

function operationRowKeys(operation: TableOperation): string[] {
  switch (operation.kind) {
    case "edit_cells":
      return uniqueKeys(operation.cells.map((cell) => cell.rowKey));
    case "insert_rows":
    case "create_table":
      return uniqueKeys((operation.rows ?? []).map((row) => row[0]));
    case "delete_rows":
    case "insert_column":
    case "delete_column":
    case "delete_table":
      return [];
    default: {
      const _exhaustive: never = operation;
      return _exhaustive;
    }
  }
}

/**
 * What the open suggestion card actually contains, vs the model's request.
 * Wrap-up must name proposedRowKeys only — one edit_table is one card.
 */
export function tableEditProposalMeta(
  requested: TableOperation,
  saved: TableOperation
): TableEditProposalMeta {
  const requestedRowKeys = operationRowKeys(requested);
  const proposedRowKeys = operationRowKeys(saved);
  const proposedSet = new Set(proposedRowKeys);
  return {
    requestedCellCount: operationCellCount(requested),
    proposedCellCount: operationCellCount(saved),
    requestedRowKeys,
    proposedRowKeys,
    droppedRowKeys: requestedRowKeys.filter((key) => !proposedSet.has(key)),
  };
}

export function tableEditProposalMessage(meta: TableEditProposalMeta): string {
  const card =
    meta.proposedRowKeys.length === 0
      ? `This card contains ${meta.proposedCellCount} cell(s) and no named rowKeys.`
      : `This card contains ${meta.proposedCellCount} cell(s) on ${formatKeys(meta.proposedRowKeys)} only.`;
  const mismatch =
    meta.droppedRowKeys.length > 0
      ? ` You requested ${meta.requestedRowKeys.length} rowKeys / ${meta.requestedCellCount} cells; dropped from the card: ${formatKeys(meta.droppedRowKeys)}. Do not list droppedRowKeys as updated.`
      : ` One edit_table call is one suggestion card that already holds every saved cell — not one card per URS row.`;
  return `${card}${mismatch} Wrap-up may name only proposedRowKeys.`;
}

/**
 * Tool `summary` the wrap-up reads. When the card holds fewer rows than the
 * model asked for, name the landed keys — do not echo a 42-cell reasoning
 * line that only two cells actually preview.
 */
export function tableEditLandedSummary(
  reasoning: string,
  meta: TableEditProposalMeta
): string {
  const trimmed = reasoning.replace(/\s+/g, " ").trim();
  if (meta.droppedRowKeys.length === 0) return trimmed;
  const landed =
    meta.proposedRowKeys.length === 0
      ? `Landed ${meta.proposedCellCount} cell(s) and no named rowKeys.`
      : `Landed ${meta.proposedCellCount} cell(s) on ${formatKeys(meta.proposedRowKeys)} only.`;
  return `${landed} Dropped from the card: ${formatKeys(meta.droppedRowKeys)}. Do not list droppedRowKeys as updated. Wrap-up may name only proposedRowKeys.`;
}
