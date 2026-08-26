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
  FMEA_COLUMN_SCHEMA,
  MITIGATION_COLUMN_SCHEMA,
  QRA_REVISION_HISTORY_COLUMN_SCHEMA,
  RISK_IDENTIFICATION_COLUMN_SCHEMA,
  TEAM_COLUMN_SCHEMA,
  type FmeaColumnId,
  type MitigationColumnId,
  type RevisionHistoryColumnId,
  type RiskIdColumnId,
  type TeamColumnId,
} from "./matrix-columns";

export type FmeaRow = Record<FmeaColumnId, string>;
export type TeamRow = Record<TeamColumnId, string>;
export type RiskIdentificationRow = Record<RiskIdColumnId, string>;
export type MitigationRow = Record<MitigationColumnId, string>;
export type QraRevisionHistoryRow = Record<RevisionHistoryColumnId, string>;

export function tableFieldDoc(
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

function parseMatrix<Id extends string, Row>(
  content: unknown,
  schema: readonly MatrixColumnSchema<Id>[],
  build: (cells: readonly string[], indices: Partial<Record<Id, number>>) => Row,
  field = "table"
): MatrixParseResult<Row> {
  const raw = extractRawRows(tableFieldDoc(content, field));
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<Id>(raw.headers, raw.dataRows, schema);
  const missingColumns = missingColumnLabels(resolution.unresolved, schema);
  const rows = raw.dataRows
    .map((cells) => build(cells, resolution.indices))
    .filter((row) => nonemptyRow(Object.values(row as Record<string, string>)));

  return { ok: true, rows, missingColumns };
}

function fmeaFromCells(
  cells: readonly string[],
  indices: Partial<Record<FmeaColumnId, number>>
): FmeaRow {
  const pick = (id: FmeaColumnId) => cellAt(cells, indices[id]);
  return {
    riskId: pick("riskId"),
    process: pick("process"),
    failure: pick("failure"),
    cause: pick("cause"),
    effect: pick("effect"),
    severity: pick("severity"),
    controls: pick("controls"),
    probability: pick("probability"),
    detectability: pick("detectability"),
    detectionMeasures: pick("detectionMeasures"),
    rpn: pick("rpn"),
    acceptable: pick("acceptable"),
    mitigation: pick("mitigation"),
    responsibility: pick("responsibility"),
    revisedSeverity: pick("revisedSeverity"),
    revisedProbability: pick("revisedProbability"),
    revisedDetectability: pick("revisedDetectability"),
    finalRpn: pick("finalRpn"),
    finalAcceptable: pick("finalAcceptable"),
  };
}

export function parseFmeaMatrix(
  content: unknown,
  field = "table"
): MatrixParseResult<FmeaRow> {
  return parseMatrix(content, FMEA_COLUMN_SCHEMA, fmeaFromCells, field);
}

export function parseTeamMatrix(content: unknown): MatrixParseResult<TeamRow> {
  return parseMatrix(content, TEAM_COLUMN_SCHEMA, (cells, indices) => ({
    serial: cellAt(cells, indices.serial),
    name: cellAt(cells, indices.name),
    department: cellAt(cells, indices.department),
    designation: cellAt(cells, indices.designation),
  }));
}

export function parseRiskIdentificationMatrix(
  content: unknown
): MatrixParseResult<RiskIdentificationRow> {
  return parseMatrix(
    content,
    RISK_IDENTIFICATION_COLUMN_SCHEMA,
    (cells, indices) => ({
      serial: cellAt(cells, indices.serial),
      process: cellAt(cells, indices.process),
      failure: cellAt(cells, indices.failure),
    })
  );
}

export function parseMitigationMatrix(
  content: unknown
): MatrixParseResult<MitigationRow> {
  return parseMatrix(content, MITIGATION_COLUMN_SCHEMA, (cells, indices) => ({
    serial: cellAt(cells, indices.serial),
    plan: cellAt(cells, indices.plan),
    reference: cellAt(cells, indices.reference),
    proposed: cellAt(cells, indices.proposed),
    actual: cellAt(cells, indices.actual),
    completionDate: cellAt(cells, indices.completionDate),
    closureDate: cellAt(cells, indices.closureDate),
    signDate: cellAt(cells, indices.signDate),
  }));
}

export function parseQraRevisionHistoryMatrix(
  content: unknown
): MatrixParseResult<QraRevisionHistoryRow> {
  return parseMatrix(
    content,
    QRA_REVISION_HISTORY_COLUMN_SCHEMA,
    (cells, indices) => ({
      revision: cellAt(cells, indices.revision),
      change: cellAt(cells, indices.change),
      changeHistoryNo: cellAt(cells, indices.changeHistoryNo),
    })
  );
}

export function approachModeFromContent(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const mode = (content as { assessmentMode?: unknown }).assessmentMode;
  return typeof mode === "string" ? mode : "";
}
