import { describe, expect, it } from "vitest";
import {
  editTableBlockedByTableRoles,
  tableRoleGuidanceForField,
} from "@/lib/ai/chat/table-role-guidance";
import { CVP_ACCEPTANCE_RINSE_HEADERS } from "@/lib/document-types/cvp/sections";

const attributeTable = {
  tableIndex: 0,
  headers: ["Attribute", "Description of Attribute", "Value / Calculation"],
  dataRowCount: 6,
};

const rinseCalcTable = {
  tableIndex: 1,
  headers: ["Attribute", "Description of Attribute", "Value / Calculation"],
  dataRowCount: 2,
};

const equipmentTable = {
  tableIndex: 2,
  headers: [...CVP_ACCEPTANCE_RINSE_HEADERS],
  dataRowCount: 0,
};

describe("tableRoleGuidanceForField", () => {
  it("flags a missing per-equipment grid when only calculation tables exist", () => {
    const hints = tableRoleGuidanceForField({
      documentType: "cleaning_verification_protocol",
      section: "cvp_acceptance_limits",
      targetField: "narrative",
      tables: [attributeTable, rinseCalcTable],
    });
    expect(hints.some((h) => h.includes("create_table"))).toBe(true);
    expect(hints.some((h) => h.includes("No table"))).toBe(true);
    expect(hints.some((h) => h.includes("tableIndex 0"))).toBe(true);
    expect(hints.some((h) => h.includes("tableIndex 1"))).toBe(true);
  });

  it("points insert_rows at the equipment table when it exists but is empty", () => {
    const hints = tableRoleGuidanceForField({
      documentType: "cleaning_verification_protocol",
      section: "cvp_acceptance_limits",
      targetField: "narrative",
      tables: [attributeTable, equipmentTable],
    });
    expect(hints.some((h) => h.includes("tableIndex 2"))).toBe(true);
    expect(hints.some((h) => h.includes("insert_rows"))).toBe(true);
    expect(hints.some((h) => h.includes("create_table"))).toBe(false);
  });
});

describe("editTableBlockedByTableRoles", () => {
  it("blocks delete_table on a calculation grid when the equipment grid is absent", () => {
    const hint = editTableBlockedByTableRoles({
      documentType: "cleaning_verification_protocol",
      section: "cvp_acceptance_limits",
      targetField: "narrative",
      operationKind: "delete_table",
      tableIndex: 1,
      liveTables: [attributeTable, rinseCalcTable],
    });
    expect(hint).toContain("create_table");
    expect(hint).toContain("missing");
  });

  it("allows delete_table on a calculation grid when the equipment grid is present", () => {
    const hint = editTableBlockedByTableRoles({
      documentType: "cleaning_verification_protocol",
      section: "cvp_acceptance_limits",
      targetField: "narrative",
      operationKind: "delete_table",
      tableIndex: 1,
      liveTables: [attributeTable, rinseCalcTable, equipmentTable],
    });
    expect(hint).toBeNull();
  });

  it("redirects wide insert_rows away from a calculation grid", () => {
    const hint = editTableBlockedByTableRoles({
      documentType: "cleaning_verification_protocol",
      section: "cvp_acceptance_limits",
      targetField: "narrative",
      operationKind: "insert_rows",
      tableIndex: 1,
      liveTables: [attributeTable, rinseCalcTable],
      operationRows: [
        ["MF-1301", "12", "100", "500", "0.2", "0.15"],
      ],
    });
    expect(hint).toMatch(/create_table|tableIndex/);
  });
});
