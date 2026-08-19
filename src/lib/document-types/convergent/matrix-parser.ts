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
  EQUIPMENT_COLUMN_SCHEMA,
  RESULTS_COLUMN_SCHEMA,
  type EquipmentColumnId,
  type ResultsColumnId,
} from "./matrix-columns";

export type EquipmentRow = {
  equipment: string;
  manufacturer: string;
  modelPartNo: string;
  assetTag: string;
  calibrationDue: string;
};

export type ResultsRow = {
  requirementId: string;
  requirementDescription: string;
  satisfiedBy: string;
  passFail: string;
};

function tableDocFromContent(content: unknown): JSONContent | null {
  if (content && typeof content === "object" && "table" in content) {
    return (content as { table: JSONContent }).table;
  }
  return content as JSONContent | null;
}

function nonemptyRow(values: readonly string[]): boolean {
  return values.some((v) => v.trim().length > 0);
}

export function parseEquipmentMatrix(
  content: unknown
): MatrixParseResult<EquipmentRow> {
  const raw = extractRawRows(tableDocFromContent(content));
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<EquipmentColumnId>(
    raw.headers,
    raw.dataRows,
    EQUIPMENT_COLUMN_SCHEMA
  );
  const missingColumns = missingColumnLabels(
    resolution.unresolved,
    EQUIPMENT_COLUMN_SCHEMA
  );

  const rows = raw.dataRows
    .map((cells) => ({
      equipment: cellAt(cells, resolution.indices.equipment),
      manufacturer: cellAt(cells, resolution.indices.manufacturer),
      modelPartNo: cellAt(cells, resolution.indices.modelPartNo),
      assetTag: cellAt(cells, resolution.indices.assetTag),
      calibrationDue: cellAt(cells, resolution.indices.calibrationDue),
    }))
    .filter((r) =>
      nonemptyRow([
        r.equipment,
        r.manufacturer,
        r.modelPartNo,
        r.assetTag,
        r.calibrationDue,
      ])
    );

  return { ok: true, rows, missingColumns };
}

export function parseResultsMatrix(
  content: unknown
): MatrixParseResult<ResultsRow> {
  const raw = extractRawRows(tableDocFromContent(content));
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<ResultsColumnId>(
    raw.headers,
    raw.dataRows,
    RESULTS_COLUMN_SCHEMA
  );
  const missingColumns = missingColumnLabels(
    resolution.unresolved,
    RESULTS_COLUMN_SCHEMA
  );

  const rows = raw.dataRows
    .map((cells) => ({
      requirementId: cellAt(cells, resolution.indices.requirementId),
      requirementDescription: cellAt(
        cells,
        resolution.indices.requirementDescription
      ),
      satisfiedBy: cellAt(cells, resolution.indices.satisfiedBy),
      passFail: cellAt(cells, resolution.indices.passFail),
    }))
    .filter((r) =>
      nonemptyRow([
        r.requirementId,
        r.requirementDescription,
        r.satisfiedBy,
        r.passFail,
      ])
    );

  return { ok: true, rows, missingColumns };
}

const PASS_FAIL_VALUES = new Set([
  "p",
  "f",
  "pass",
  "fail",
  "passed",
  "failed",
  "met",
  "not met",
]);

export function normalizePassFail(value: string): "pass" | "fail" | null {
  const t = value.trim().toLowerCase().replace(/[./]/g, "");
  if (t === "p" || t === "pass" || t === "passed" || t === "met") return "pass";
  if (t === "f" || t === "fail" || t === "failed" || t === "not met") {
    return "fail";
  }
  const compact = value.trim().toLowerCase();
  if (PASS_FAIL_VALUES.has(compact)) {
    return compact.startsWith("p") || compact === "met" ? "pass" : "fail";
  }
  return null;
}

const DATE_LIKE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4})\b/i;

export function parseFlexibleDate(value: string): Date | null {
  const t = value.trim();
  if (!t || /^n\/?a$/i.test(t)) return null;
  if (!DATE_LIKE.test(t) && !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const parsed = new Date(t);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}
