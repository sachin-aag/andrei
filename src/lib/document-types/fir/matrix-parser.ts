import type { JSONContent } from "@tiptap/core";
import {
  missingColumnLabels,
  resolveColumns,
  type MatrixColumnSchema,
} from "@/lib/document-types/design-verification/matrix-columns";
import {
  cellAt,
  extractRawRows,
  type MatrixParseResult,
} from "@/lib/document-types/design-verification/matrix-parser";
import {
  FIR_ACTION_COLUMN_SCHEMA,
  FIR_ATTACHMENT_COLUMN_SCHEMA,
  FIR_CHRONOLOGY_COLUMN_SCHEMA,
  FIR_EFFECTIVENESS_COLUMN_SCHEMA,
  FIR_HISTORIC_COLUMN_SCHEMA,
  FIR_HUMAN_ERROR_COLUMN_SCHEMA,
  FIR_TEAM_COLUMN_SCHEMA,
  type FirActionColumnId,
  type FirAttachmentColumnId,
  type FirChronologyColumnId,
  type FirEffectivenessColumnId,
  type FirHistoricColumnId,
  type FirHumanErrorColumnId,
  type FirTeamColumnId,
} from "./matrix-columns";

export type FirTeamRow = Record<FirTeamColumnId, string>;
export type FirChronologyRow = Record<FirChronologyColumnId, string>;
export type FirHistoricRow = Record<FirHistoricColumnId, string>;
export type FirHumanErrorRow = Record<FirHumanErrorColumnId, string>;
export type FirActionRow = Record<FirActionColumnId, string>;
export type FirEffectivenessRow = Record<FirEffectivenessColumnId, string>;
export type FirAttachmentRow = Record<FirAttachmentColumnId, string>;

export function firTableDoc(
  content: unknown,
  field = "table"
): JSONContent | null {
  if (content && typeof content === "object" && field in content) {
    return (content as Record<string, JSONContent>)[field] ?? null;
  }
  return content as JSONContent | null;
}

function nonemptyRow(values: readonly string[]): boolean {
  return values.some((v) => v.trim().length > 0);
}

function parseMatrix<Id extends string>(
  content: unknown,
  schema: readonly MatrixColumnSchema<Id>[]
): MatrixParseResult<Record<Id, string>> {
  const raw = extractRawRows(firTableDoc(content));
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<Id>(raw.headers, raw.dataRows, schema);
  const missingColumns = missingColumnLabels(resolution.unresolved, schema);
  const rows = raw.dataRows
    .map((cells) => {
      const row = {} as Record<Id, string>;
      for (const column of schema) {
        row[column.id] = cellAt(cells, resolution.indices[column.id]);
      }
      return row;
    })
    .filter((row) => nonemptyRow(Object.values(row)));

  return { ok: true, rows, missingColumns };
}

export function parseFirTeamMatrix(
  content: unknown
): MatrixParseResult<FirTeamRow> {
  return parseMatrix(content, FIR_TEAM_COLUMN_SCHEMA);
}

export function parseFirChronologyMatrix(
  content: unknown
): MatrixParseResult<FirChronologyRow> {
  return parseMatrix(content, FIR_CHRONOLOGY_COLUMN_SCHEMA);
}

export function parseFirHistoricMatrix(
  content: unknown
): MatrixParseResult<FirHistoricRow> {
  return parseMatrix(content, FIR_HISTORIC_COLUMN_SCHEMA);
}

export function parseFirHumanErrorMatrix(
  content: unknown
): MatrixParseResult<FirHumanErrorRow> {
  return parseMatrix(content, FIR_HUMAN_ERROR_COLUMN_SCHEMA);
}

export function parseFirActionMatrix(
  content: unknown
): MatrixParseResult<FirActionRow> {
  return parseMatrix(content, FIR_ACTION_COLUMN_SCHEMA);
}

export function parseFirEffectivenessMatrix(
  content: unknown
): MatrixParseResult<FirEffectivenessRow> {
  return parseMatrix(content, FIR_EFFECTIVENESS_COLUMN_SCHEMA);
}

export function parseFirAttachmentMatrix(
  content: unknown
): MatrixParseResult<FirAttachmentRow> {
  return parseMatrix(content, FIR_ATTACHMENT_COLUMN_SCHEMA);
}
