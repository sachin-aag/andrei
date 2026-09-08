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
import { tableFieldDoc } from "@/lib/document-types/qra/matrix-parser";
import {
  ACCESS_CONTROL_COLUMN_SCHEMA,
  ALARM_COLUMN_SCHEMA,
  AUDIT_TRAIL_COLUMN_SCHEMA,
  BREAKDOWN_COLUMN_SCHEMA,
  CALIBRATION_COLUMN_SCHEMA,
  CSV_STATUS_COLUMN_SCHEMA,
  ELR_REVISION_HISTORY_COLUMN_SCHEMA,
  MEDIA_FILL_COLUMN_SCHEMA,
  MONITORING_COLUMN_SCHEMA,
  PREVENTIVE_MAINTENANCE_COLUMN_SCHEMA,
  QMS_COLUMN_SCHEMA,
  QUALIFICATION_COLUMN_SCHEMA,
  RESPONSIBILITIES_COLUMN_SCHEMA,
  type AccessControlColumnId,
  type AlarmColumnId,
  type AuditTrailColumnId,
  type BreakdownColumnId,
  type CalibrationColumnId,
  type CsvStatusColumnId,
  type ElrRevisionHistoryColumnId,
  type MediaFillColumnId,
  type MonitoringColumnId,
  type PreventiveMaintenanceColumnId,
  type QmsColumnId,
  type QualificationColumnId,
  type ResponsibilitiesColumnId,
} from "./matrix-columns";

export type QualificationRow = Record<QualificationColumnId, string>;
export type MediaFillRow = Record<MediaFillColumnId, string>;
export type MonitoringRow = Record<MonitoringColumnId, string>;
export type CalibrationRow = Record<CalibrationColumnId, string>;
export type PreventiveMaintenanceRow = Record<
  PreventiveMaintenanceColumnId,
  string
>;
export type BreakdownRow = Record<BreakdownColumnId, string>;
export type QmsRow = Record<QmsColumnId, string>;
export type AlarmRow = Record<AlarmColumnId, string>;
export type AccessControlRow = Record<AccessControlColumnId, string>;
export type AuditTrailRow = Record<AuditTrailColumnId, string>;
export type CsvStatusRow = Record<CsvStatusColumnId, string>;
export type ResponsibilitiesRow = Record<ResponsibilitiesColumnId, string>;
export type ElrRevisionHistoryRow = Record<ElrRevisionHistoryColumnId, string>;

function nonemptyRow(values: readonly string[]): boolean {
  return values.some((v) => v.trim().length > 0);
}

/**
 * Build one row per schema column by resolved index. Every ELR table is a flat
 * `Record<ColumnId, string>`, so the row builder is shared.
 */
function parseElrMatrix<Id extends string>(
  content: unknown,
  schema: readonly MatrixColumnSchema<Id>[],
  field = "table"
): MatrixParseResult<Record<Id, string>> {
  const raw = extractRawRows(tableFieldDoc(content, field));
  if ("error" in raw) return { ok: false, reason: raw.error };

  const resolution = resolveColumns<Id>(raw.headers, raw.dataRows, schema);
  const missingColumns = missingColumnLabels(resolution.unresolved, schema);
  const rows = raw.dataRows
    .map((cells) => {
      const row = {} as Record<Id, string>;
      for (const col of schema) {
        row[col.id] = cellAt(cells, resolution.indices[col.id]);
      }
      return row;
    })
    .filter((row) => nonemptyRow(Object.values(row)));

  return { ok: true, rows, missingColumns };
}

export function parseQualificationMatrix(content: unknown) {
  return parseElrMatrix(content, QUALIFICATION_COLUMN_SCHEMA);
}

export function parseMediaFillMatrix(content: unknown) {
  return parseElrMatrix(content, MEDIA_FILL_COLUMN_SCHEMA);
}

export function parseMonitoringMatrix(content: unknown) {
  return parseElrMatrix(content, MONITORING_COLUMN_SCHEMA);
}

export function parseCalibrationMatrix(content: unknown) {
  return parseElrMatrix(content, CALIBRATION_COLUMN_SCHEMA);
}

export function parsePreventiveMaintenanceMatrix(content: unknown) {
  return parseElrMatrix(content, PREVENTIVE_MAINTENANCE_COLUMN_SCHEMA);
}

export function parseBreakdownMatrix(content: unknown) {
  return parseElrMatrix(content, BREAKDOWN_COLUMN_SCHEMA);
}

export function parseQmsMatrix(content: unknown) {
  return parseElrMatrix(content, QMS_COLUMN_SCHEMA);
}

export function parseAlarmMatrix(content: unknown) {
  return parseElrMatrix(content, ALARM_COLUMN_SCHEMA);
}

export function parseAccessControlMatrix(content: unknown) {
  return parseElrMatrix(content, ACCESS_CONTROL_COLUMN_SCHEMA);
}

export function parseAuditTrailMatrix(content: unknown) {
  return parseElrMatrix(content, AUDIT_TRAIL_COLUMN_SCHEMA);
}

export function parseCsvStatusMatrix(content: unknown) {
  return parseElrMatrix(content, CSV_STATUS_COLUMN_SCHEMA);
}

export function parseResponsibilitiesMatrix(content: unknown) {
  return parseElrMatrix(content, RESPONSIBILITIES_COLUMN_SCHEMA);
}

export function parseElrRevisionHistoryMatrix(content: unknown) {
  return parseElrMatrix(content, ELR_REVISION_HISTORY_COLUMN_SCHEMA);
}

// ------------------------------------------------------------- cell semantics

/** Yes / No / Y / N cells, tolerant of the free text people actually type. */
export function isYes(cell: string): boolean {
  return /^(y|yes|true)\b/i.test(cell.trim());
}

export function isNo(cell: string): boolean {
  return /^(n|no|false|nil|none)\b/i.test(cell.trim());
}

/** Treat a reference cell as filled only when it is more than a dash or "NA". */
export function hasReference(cell: string): boolean {
  const t = cell.trim();
  if (!t) return false;
  return !/^(na|n\/a|nil|none|-|--|—)$/i.test(t);
}

export function isOutOfTolerance(cell: string): boolean {
  return /\boot\b|out of tolerance|fail/i.test(cell.trim());
}

export function isDelayed(cell: string): boolean {
  return /delay|overdue|missed|not done/i.test(cell.trim());
}

/** MJ categorises alarms as Direct Impact / Indirect Impact on the trend report. */
export function isDirectImpact(cell: string): boolean {
  const t = cell.trim();
  if (/indirect/i.test(t)) return false;
  return /^di\b/i.test(t) || /direct/i.test(t);
}
