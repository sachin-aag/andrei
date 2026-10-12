import type { DocumentType, SectionType } from "@/db/schema";
import { formatLiveHeaders } from "@/lib/ai/chat/table-schema";
import {
  CVP_ACCEPTANCE_RINSE_HEADERS,
  CVP_MACO_FORMULA_HEADERS,
} from "@/lib/document-types/cvp/sections";

export type LiveTableSummary = {
  tableIndex: number;
  headers: string[];
  dataRowCount: number;
};

type TableRoleId = "cvp_attribute_limit_calc" | "cvp_per_equipment_rinse";

type TableRoleSpec = {
  id: TableRoleId;
  label: string;
  requiredHeaderFragments: readonly string[];
  createHeaders?: readonly string[];
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function headersMatchRole(headers: readonly string[], role: TableRoleSpec): boolean {
  const normalized = headers.map(normalizeHeader);
  return role.requiredHeaderFragments.every((fragment) =>
    normalized.some((header) => header.includes(fragment.toLowerCase()))
  );
}

function findTableForRole(
  tables: readonly LiveTableSummary[],
  role: TableRoleSpec
): LiveTableSummary | undefined {
  return tables.find((table) => headersMatchRole(table.headers, role));
}

const CVP_ATTRIBUTE_LIMIT_CALC: TableRoleSpec = {
  id: "cvp_attribute_limit_calc",
  label: "limit calculation grid (Attribute | Description | Value / Calculation)",
  requiredHeaderFragments: ["attribute", "value / calculation"],
};

const CVP_PER_EQUIPMENT_RINSE: TableRoleSpec = {
  id: "cvp_per_equipment_rinse",
  label: "per-equipment final rinse acceptance grid",
  requiredHeaderFragments: ["equipment id", "final rinse acceptance criteria"],
  createHeaders: CVP_ACCEPTANCE_RINSE_HEADERS,
};

function cvpAcceptanceLimitsRoles(): {
  attribute: TableRoleSpec;
  perEquipment: TableRoleSpec;
} {
  return { attribute: CVP_ATTRIBUTE_LIMIT_CALC, perEquipment: CVP_PER_EQUIPMENT_RINSE };
}

/**
 * Actionable hints from live table headers (not user-message parsing).
 * Shown on read_section and used to steer edit_table away from wrong ops.
 */
export function tableRoleGuidanceForField(args: {
  documentType: DocumentType;
  section: SectionType;
  targetField: string;
  tables?: readonly LiveTableSummary[];
}): string[] {
  if (args.documentType !== "cleaning_verification_protocol") return [];
  if (args.section !== "cvp_acceptance_limits" || args.targetField !== "narrative") {
    return [];
  }
  const tables = args.tables ?? [];
  if (tables.length === 0) return [];

  const { attribute, perEquipment } = cvpAcceptanceLimitsRoles();
  const hints: string[] = [];

  const attributeTables = tables.filter((t) => headersMatchRole(t.headers, attribute));
  const equipmentTable = findTableForRole(tables, perEquipment);

  for (const table of attributeTables) {
    hints.push(
      `tableIndex ${table.tableIndex}: ${attribute.label} (${formatLiveHeaders(table.headers)}). ` +
        "Use edit_cells or insert_rows only for calculation rows in these three columns — not for equipment ID rows."
    );
  }

  if (!equipmentTable) {
    hints.push(
      "No table in this field has the per-equipment rinse headers (Equipment ID and Final rinse acceptance criteria (ppm)). " +
        `To add rinse acceptance criteria for all equipment, call edit_table create_table with headers: ${formatLiveHeaders(perEquipment.createHeaders ?? CVP_ACCEPTANCE_RINSE_HEADERS)}, then insert_rows with one row per equipment from Sections 8.0–10.0. ` +
        "Do not delete_table on a limit-calculation grid to make room."
    );
  } else if (equipmentTable.dataRowCount === 0) {
    hints.push(
      `tableIndex ${equipmentTable.tableIndex} is the per-equipment rinse grid (${formatLiveHeaders(equipmentTable.headers)}). ` +
        "Use edit_table insert_rows to append one row per equipment (copy equipment IDs and surface areas from Sections 8.0–10.0)."
    );
  } else {
    hints.push(
      `tableIndex ${equipmentTable.tableIndex} is the per-equipment rinse grid — use insert_rows or edit_cells on that tableIndex, not on Attribute | Description | Value grids.`
    );
  }

  return hints;
}

export function editTableBlockedByTableRoles(args: {
  documentType: DocumentType;
  section: SectionType;
  targetField: string;
  operationKind: string;
  tableIndex: number;
  liveTables: readonly LiveTableSummary[];
  operationRows?: readonly (readonly string[])[];
}): string | null {
  if (args.documentType !== "cleaning_verification_protocol") return null;
  if (args.section !== "cvp_acceptance_limits" || args.targetField !== "narrative") {
    return null;
  }

  const { attribute, perEquipment } = cvpAcceptanceLimitsRoles();
  const target = args.liveTables[args.tableIndex];
  if (!target) return null;

  const equipmentTable = findTableForRole(args.liveTables, perEquipment);
  const rinseHeaders = formatLiveHeaders(
    perEquipment.createHeaders ?? CVP_ACCEPTANCE_RINSE_HEADERS
  );

  if (args.operationKind === "delete_table") {
    if (!headersMatchRole(target.headers, attribute)) return null;
    if (equipmentTable) return null;
    return (
      "This table is a limit-calculation grid (Attribute | Description | Value / Calculation), not the per-equipment rinse matrix. " +
      `The per-equipment grid is missing from this field — use edit_table create_table with headers: ${rinseHeaders}, then insert_rows. delete_table does not add equipment rows.`
    );
  }

  if (args.operationKind === "insert_rows") {
    if (!headersMatchRole(target.headers, attribute)) return null;
    const rowWidths = (args.operationRows ?? []).map((row) => row.length);
    const attributeColCount = target.headers.length;
    const looksLikeEquipmentRows =
      rowWidths.some((width) => width >= 5) ||
      rowWidths.some((width) => width > 0 && width !== attributeColCount);
    if (!looksLikeEquipmentRows) return null;
    if (equipmentTable) {
      return (
        `insert_rows on tableIndex ${args.tableIndex} targets a three-column calculation grid (${formatLiveHeaders(target.headers)}). ` +
        `Equipment rows belong on tableIndex ${equipmentTable.tableIndex} (${formatLiveHeaders(equipmentTable.headers)}).`
      );
    }
    return (
      `insert_rows on tableIndex ${args.tableIndex} does not match the Attribute | Description | Value grid. ` +
      `Use create_table with headers: ${rinseHeaders}, then insert_rows for each equipment.`
    );
  }

  return null;
}

/** Exported for tests — MACO-style header signature used in 11.0 calculation tables. */
export function cvpMacoFormulaHeaderSignature(): readonly string[] {
  return CVP_MACO_FORMULA_HEADERS;
}
