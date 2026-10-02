import type { JSONContent } from "@tiptap/core";
import {
  isRtmNotFoundMarker,
  rtmReferenceColumnIndexes,
  type QsrRtmSection,
  type RtmStageFamily,
} from "@/lib/ai/chat/qsr-row-grounding";
import { QSR_TABLE_HEADERS } from "@/lib/document-types/qsr/sections";
import type { TableOperation } from "@/lib/suggestions/table-operation";
import type { RtmIdentityRow } from "@/lib/ai/chat/rtm-identity";

export type RtmFamilyCell = {
  ursId: string;
  text: string;
  citation: string;
};

export type RtmFamilyCells = {
  family: RtmStageFamily;
  cells: RtmFamilyCell[];
};

function withCitation(text: string, citation: string): string {
  const body = text.trim();
  const cite = citation.trim();
  if (!body) return "";
  if (!cite) return body;
  if (body.includes(cite)) return body;
  return `${body} ${cite}`;
}

function emptyRow(width: number): string[] {
  return Array.from({ length: width }, () => "");
}

function applyFamilyToRow(
  row: string[],
  familyCells: readonly RtmFamilyCells[],
  cols: NonNullable<ReturnType<typeof rtmReferenceColumnIndexes>>,
  ursId: string
): void {
  const byFamily = new Map<RtmStageFamily, RtmFamilyCell>();
  for (const group of familyCells) {
    const cell = group.cells.find(
      (item) => item.ursId.toUpperCase() === ursId.toUpperCase()
    );
    if (cell) byFamily.set(group.family, cell);
  }
  const fill = (family: RtmStageFamily, col: number) => {
    const cell = byFamily.get(family);
    if (!cell) return;
    row[col] = withCitation(cell.text, cell.citation);
  };
  fill("dq", cols.dq);
  fill("iq", cols.iq);
  fill("oq", cols.oq);
  fill("pq", cols.pq);
  const familyTexts = [row[cols.dq], row[cols.iq], row[cols.oq], row[cols.pq]];
  const allNa =
    familyTexts.every((text) => isRtmNotFoundMarker(text)) &&
    familyTexts.some((text) => Boolean((text ?? "").trim()));
  if (allNa && !(row[cols.remarks] ?? "").trim()) {
    row[cols.remarks] = "NA";
  }
}

function identityOnRow(
  row: string[],
  identity: RtmIdentityRow,
  headers: readonly string[]
): void {
  row[0] = identity.ursId;
  const citedRequirement = withCitation(
    identity.userRequirement,
    identity.citation
  );
  row[1] = identity.parameters;
  row[2] = citedRequirement || identity.parameters;
  if (headers[3] === "Operation range") {
    row[3] = row[3] ?? "";
  }
}

export function composeRtmOperations(input: {
  section: QsrRtmSection;
  fieldDoc: JSONContent | null;
  identityRows: readonly RtmIdentityRow[];
  familyCells: readonly RtmFamilyCells[];
  insertUrsIds: readonly string[];
  editUrsIds: readonly string[];
}): {
  insertRows: TableOperation | null;
  editCells: TableOperation | null;
} {
  const headers = QSR_TABLE_HEADERS[input.section];
  const cols = rtmReferenceColumnIndexes(input.section);
  const identityById = new Map(
    input.identityRows.map((row) => [row.ursId.toUpperCase(), row])
  );

  const insertRows: string[][] = [];
  for (const id of input.insertUrsIds) {
    const identity = identityById.get(id.toUpperCase());
    if (!identity) continue;
    const row = emptyRow(headers.length);
    identityOnRow(row, identity, headers);
    if (cols) applyFamilyToRow(row, input.familyCells, cols, id);
    insertRows.push(row);
  }

  const cells: Array<{
    row: number;
    col: number;
    rowKey: string;
    insertText: string;
  }> = [];
  for (const id of input.editUrsIds) {
    const identity = identityById.get(id.toUpperCase());
    if (identity) {
      const row = emptyRow(headers.length);
      identityOnRow(row, identity, headers);
      if (cols) applyFamilyToRow(row, input.familyCells, cols, id);
      for (let col = 1; col < headers.length; col++) {
        const text = row[col] ?? "";
        if (!text) continue;
        cells.push({
          row: 1,
          col,
          rowKey: id,
          insertText: text,
        });
      }
      continue;
    }
    if (!cols) continue;
    const row = emptyRow(headers.length);
    row[0] = id;
    applyFamilyToRow(row, input.familyCells, cols, id);
    for (const col of [cols.dq, cols.iq, cols.oq, cols.pq, cols.remarks]) {
      const text = row[col] ?? "";
      if (!text) continue;
      cells.push({
        row: 1,
        col,
        rowKey: id,
        insertText: text,
      });
    }
  }

  return {
    insertRows:
      insertRows.length > 0
        ? { kind: "insert_rows", tableIndex: 0, rows: insertRows }
        : null,
    editCells:
      cells.length > 0
        ? { kind: "edit_cells", tableIndex: 0, cells }
        : null,
  };
}

export function identityOnlyOperation(
  operation: TableOperation,
  section: QsrRtmSection
): TableOperation {
  const cols = rtmReferenceColumnIndexes(section);
  if (!cols) return operation;
  const familyCols = new Set([cols.dq, cols.iq, cols.oq, cols.pq, cols.remarks]);
  if (operation.kind === "insert_rows") {
    return {
      ...operation,
      rows: operation.rows.map((row) =>
        row.map((cell, col) => (familyCols.has(col) ? "" : cell))
      ),
    };
  }
  if (operation.kind === "edit_cells") {
    return {
      ...operation,
      cells: operation.cells.filter((cell) => !familyCols.has(cell.col)),
    };
  }
  return operation;
}

export function countFamilyCoverage(
  operations: readonly TableOperation[],
  section: QsrRtmSection
): { dq: number; iq: number; oq: number; pq: number } {
  const cols = rtmReferenceColumnIndexes(section);
  const counts = { dq: 0, iq: 0, oq: 0, pq: 0 };
  if (!cols) return counts;
  const bump = (col: number, text: string) => {
    if (!text.replace(/\[[^\]]*\]/g, "").trim()) return;
    if (col === cols.dq) counts.dq += 1;
    else if (col === cols.iq) counts.iq += 1;
    else if (col === cols.oq) counts.oq += 1;
    else if (col === cols.pq) counts.pq += 1;
  };
  for (const operation of operations) {
    if (operation.kind === "insert_rows") {
      for (const row of operation.rows) {
        bump(cols.dq, row[cols.dq] ?? "");
        bump(cols.iq, row[cols.iq] ?? "");
        bump(cols.oq, row[cols.oq] ?? "");
        bump(cols.pq, row[cols.pq] ?? "");
      }
    }
    if (operation.kind === "edit_cells") {
      for (const cell of operation.cells) {
        bump(cell.col, cell.insertText);
      }
    }
  }
  return counts;
}
