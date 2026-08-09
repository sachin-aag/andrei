import type { JSONContent } from "@tiptap/core";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import {
  DV_TEST_RESULTS_HEADERS,
  DV_TRACEABILITY_HEADERS,
} from "./sections";

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
  | { ok: true; rows: T[] }
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

function normalizeHeader(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function headersMatch(
  actual: string[],
  expected: readonly string[]
): boolean {
  if (actual.length !== expected.length) return false;
  return expected.every(
    (h, i) => normalizeHeader(actual[i] ?? "") === normalizeHeader(h)
  );
}

function parseTableRows(
  doc: JSONContent | null | undefined,
  expectedHeaders: readonly string[]
): MatrixParseResult<string[]> {
  const table = findTable(doc);
  if (!table?.content?.length) {
    return { ok: false, reason: "No table found in section content" };
  }
  const rows = table.content.filter((n) => n.type === "tableRow");
  if (rows.length < 1) {
    return { ok: false, reason: "Table has no header row" };
  }
  const headerCells = rows[0]?.content ?? [];
  const headers = headerCells.map((c) => cellText(c));
  if (!headersMatch(headers, expectedHeaders)) {
    return {
      ok: false,
      reason: `Matrix is not machine-readable: expected headers [${expectedHeaders.join(", ")}] but found [${headers.join(", ")}]`,
    };
  }
  const dataRows = rows.slice(1).map((row) => {
    const cells = row.content ?? [];
    return expectedHeaders.map((_, i) => cellText(cells[i]));
  });
  return { ok: true, rows: dataRows };
}

export function parseTraceabilityMatrix(
  content: unknown
): MatrixParseResult<TraceabilityRow> {
  const tableDoc =
    content && typeof content === "object" && "table" in content
      ? (content as { table: JSONContent }).table
      : (content as JSONContent | null);
  const parsed = parseTableRows(tableDoc, DV_TRACEABILITY_HEADERS);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    rows: parsed.rows
      .filter((cells) => cells.some((c) => c.length > 0))
      .map((cells) => ({
        requirementId: cells[0] ?? "",
        designInput: cells[1] ?? "",
        testMethodId: cells[2] ?? "",
        result: cells[3] ?? "",
        riskControlLink: cells[4] ?? "",
      })),
  };
}

export function parseTestResultsMatrix(
  content: unknown
): MatrixParseResult<TestResultRow> {
  const tableDoc =
    content && typeof content === "object" && "table" in content
      ? (content as { table: JSONContent }).table
      : (content as JSONContent | null);
  const parsed = parseTableRows(tableDoc, DV_TEST_RESULTS_HEADERS);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    rows: parsed.rows
      .filter((cells) => cells.some((c) => c.length > 0))
      .map((cells) => ({
        testId: cells[0] ?? "",
        requirementId: cells[1] ?? "",
        result: cells[2] ?? "",
        passFail: cells[3] ?? "",
        rawDataRef: cells[4] ?? "",
      })),
  };
}
