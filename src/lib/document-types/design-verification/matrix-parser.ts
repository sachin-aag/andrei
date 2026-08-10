import type { JSONContent } from "@tiptap/core";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import {
  missingColumnLabels,
  resolveColumns,
  TEST_RESULTS_COLUMN_SCHEMA,
  TRACEABILITY_COLUMN_SCHEMA,
  type TestResultsColumnId,
  type TraceabilityColumnId,
} from "./matrix-columns";

export type TraceabilityRow = {
  requirementId: string;
  designInput: string;
  testMethodId: string;
  result: string;
  riskControlLink: string;
};

export type TestResultRow = {
  testId: string;
  requirementId: string;
  result: string;
  passFail: string;
  rawDataRef: string;
};

export type MatrixParseResult<T> =
  | { ok: true; rows: T[]; missingColumns: string[] }
  | { ok: false; reason: string };

function cellText(cell: JSONContent | undefined): string {
  if (!cell) return "";
  return richJsonToPlainText(cell).trim();
}

function findTable(doc: JSONContent | null | undefined): JSONContent | null {
  if (!doc) return null;
  if (doc.type === "table") return doc;
  for (const child of doc.content ?? []) {
    const found = findTable(child);
    if (found) return found;
  }
  return null;
}

function extractRawRows(
  doc: JSONContent | null | undefined
): { headers: string[]; dataRows: string[][] } | { error: string } {
  const table = findTable(doc);
  if (!table?.content?.length) {
    return { error: "No table found in section content" };
  }
  const rows = table.content.filter((n) => n.type === "tableRow");
  if (rows.length < 1) {
    return { error: "Table has no rows" };
  }
  const headerCells = rows[0]?.content ?? [];
  const headers = headerCells.map((c) => cellText(c));
  const dataRows = rows.slice(1).map((row) => {
    const cells = row.content ?? [];
    const width = Math.max(headers.length, cells.length);
    return Array.from({ length: width }, (_, i) => cellText(cells[i]));
  });
  return { headers, dataRows };
}

function cellAt(
  row: readonly string[],
  index: number | undefined
): string {
  if (index === undefined) return "";
  return row[index] ?? "";
}

export function parseTraceabilityMatrix(
  content: unknown
): MatrixParseResult<TraceabilityRow> {
  const tableDoc =
    content && typeof content === "object" && "table" in content
      ? (content as { table: JSONContent }).table
      : (content as JSONContent | null);
  const raw = extractRawRows(tableDoc);
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<TraceabilityColumnId>(
    raw.headers,
    raw.dataRows,
    TRACEABILITY_COLUMN_SCHEMA
  );
  const missingColumns = missingColumnLabels(
    resolution.unresolved,
    TRACEABILITY_COLUMN_SCHEMA
  );

  const rows = raw.dataRows
    .map((cells) => ({
      requirementId: cellAt(cells, resolution.indices.requirementId),
      designInput: cellAt(cells, resolution.indices.designInput),
      testMethodId: cellAt(cells, resolution.indices.testMethodId),
      result: cellAt(cells, resolution.indices.result),
      riskControlLink: cellAt(cells, resolution.indices.riskControlLink),
    }))
    .filter((r) =>
      Boolean(
        r.requirementId ||
          r.designInput ||
          r.testMethodId ||
          r.result ||
          r.riskControlLink
      )
    );

  return { ok: true, rows, missingColumns };
}

export function parseTestResultsMatrix(
  content: unknown
): MatrixParseResult<TestResultRow> {
  const tableDoc =
    content && typeof content === "object" && "table" in content
      ? (content as { table: JSONContent }).table
      : (content as JSONContent | null);
  const raw = extractRawRows(tableDoc);
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<TestResultsColumnId>(
    raw.headers,
    raw.dataRows,
    TEST_RESULTS_COLUMN_SCHEMA
  );
  const missingColumns = missingColumnLabels(
    resolution.unresolved,
    TEST_RESULTS_COLUMN_SCHEMA
  );

  const rows = raw.dataRows
    .map((cells) => ({
      testId: cellAt(cells, resolution.indices.testId),
      requirementId: cellAt(cells, resolution.indices.requirementId),
      result: cellAt(cells, resolution.indices.result),
      passFail: cellAt(cells, resolution.indices.passFail),
      rawDataRef: cellAt(cells, resolution.indices.rawDataRef),
    }))
    .filter((r) =>
      Boolean(
        r.testId || r.requirementId || r.result || r.passFail || r.rawDataRef
      )
    );

  return { ok: true, rows, missingColumns };
}
