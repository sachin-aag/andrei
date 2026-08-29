import type { JSONContent } from "@tiptap/core";
import {
  missingColumnLabels,
  resolveColumns,
} from "@/lib/document-types/design-verification/matrix-columns";
import {
  cellAt,
  extractRawRows,
  type MatrixParseResult,
} from "@/lib/document-types/design-verification/matrix-parser";
import {
  MECHANICAL_RESULTS_COLUMN_SCHEMA,
  REVISION_HISTORY_COLUMN_SCHEMA,
  UUT_COLUMN_SCHEMA,
  type MechanicalResultsColumnId,
  type RevisionHistoryColumnId,
  type UutColumnId,
} from "./matrix-columns";

export type UutRow = {
  equipment: string;
  manufacturer: string;
  partNumber: string;
  serialNumber: string;
  revision: string;
};

export type MechanicalResultsRow = {
  requirementId: string;
  requirementDescription: string;
  notesResults: string;
  passFail: string;
};

export type RevisionHistoryRow = {
  revisionLevel: string;
  revisionDate: string;
  changeOrderNo: string;
  description: string;
  author: string;
};

/**
 * Sections here carry more than one table, so the field is named explicitly
 * rather than assumed to be `table`.
 */
export function tableFieldDoc(
  content: unknown,
  field: string
): JSONContent | null {
  if (content && typeof content === "object" && field in content) {
    return (content as Record<string, JSONContent>)[field] ?? null;
  }
  return content as JSONContent | null;
}

function nonemptyRow(values: readonly string[]): boolean {
  return values.some((v) => v.trim().length > 0);
}

export function parseUutMatrix(content: unknown): MatrixParseResult<UutRow> {
  const raw = extractRawRows(tableFieldDoc(content, "table"));
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<UutColumnId>(
    raw.headers,
    raw.dataRows,
    UUT_COLUMN_SCHEMA
  );
  const missingColumns = missingColumnLabels(
    resolution.unresolved,
    UUT_COLUMN_SCHEMA
  );

  const rows = raw.dataRows
    .map((cells) => ({
      equipment: cellAt(cells, resolution.indices.equipment),
      manufacturer: cellAt(cells, resolution.indices.manufacturer),
      partNumber: cellAt(cells, resolution.indices.partNumber),
      serialNumber: cellAt(cells, resolution.indices.serialNumber),
      revision: cellAt(cells, resolution.indices.revision),
    }))
    .filter((r) =>
      nonemptyRow([
        r.equipment,
        r.manufacturer,
        r.partNumber,
        r.serialNumber,
        r.revision,
      ])
    );

  return { ok: true, rows, missingColumns };
}

export function parseMechanicalResultsMatrix(
  content: unknown,
  field: "hardwareTable" | "systemTable"
): MatrixParseResult<MechanicalResultsRow> {
  const raw = extractRawRows(tableFieldDoc(content, field));
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<MechanicalResultsColumnId>(
    raw.headers,
    raw.dataRows,
    MECHANICAL_RESULTS_COLUMN_SCHEMA
  );
  const missingColumns = missingColumnLabels(
    resolution.unresolved,
    MECHANICAL_RESULTS_COLUMN_SCHEMA
  );

  const rows = raw.dataRows
    .map((cells) => ({
      requirementId: cellAt(cells, resolution.indices.requirementId),
      requirementDescription: cellAt(
        cells,
        resolution.indices.requirementDescription
      ),
      notesResults: cellAt(cells, resolution.indices.notesResults),
      passFail: cellAt(cells, resolution.indices.passFail),
    }))
    .filter((r) =>
      nonemptyRow([
        r.requirementId,
        r.requirementDescription,
        r.notesResults,
        r.passFail,
      ])
    );

  return { ok: true, rows, missingColumns };
}

export function parseRevisionHistoryMatrix(
  content: unknown
): MatrixParseResult<RevisionHistoryRow> {
  const raw = extractRawRows(tableFieldDoc(content, "table"));
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<RevisionHistoryColumnId>(
    raw.headers,
    raw.dataRows,
    REVISION_HISTORY_COLUMN_SCHEMA
  );
  const missingColumns = missingColumnLabels(
    resolution.unresolved,
    REVISION_HISTORY_COLUMN_SCHEMA
  );

  const rows = raw.dataRows
    .map((cells) => ({
      revisionLevel: cellAt(cells, resolution.indices.revisionLevel),
      revisionDate: cellAt(cells, resolution.indices.revisionDate),
      changeOrderNo: cellAt(cells, resolution.indices.changeOrderNo),
      description: cellAt(cells, resolution.indices.description),
      author: cellAt(cells, resolution.indices.author),
    }))
    .filter((r) =>
      nonemptyRow([
        r.revisionLevel,
        r.revisionDate,
        r.changeOrderNo,
        r.description,
        r.author,
      ])
    );

  return { ok: true, rows, missingColumns };
}

/**
 * Mechanical results verdicts are Pass, Fail or N/A only — a trailing asterisk
 * keys a footnote beneath the table and does not change the verdict. This is
 * deliberately stricter than the software report, which allows per-configuration
 * forms such as "P for TOP-00017 PCON".
 */
export function normalizeMechanicalVerdict(
  value: string
): "pass" | "fail" | "na" | null {
  const t = value.trim().replace(/\*+$/, "").trim().toLowerCase();
  if (!t) return null;
  if (t === "pass" || t === "p") return "pass";
  if (t === "fail" || t === "f") return "fail";
  if (/^n\/?\.?a\.?$/.test(t) || t === "not applicable") return "na";
  return null;
}
