import { describe, expect, it } from "vitest";
import {
  cvpAcceptanceLimitsDeleteBlocked,
  userAskedToAddTable,
  userExplicitlyAskedToRemoveTable,
} from "@/lib/ai/chat/cvp-acceptance-limits-edit";

describe("cvpAcceptanceLimitsDeleteBlocked", () => {
  it("detects add-table user intent", () => {
    expect(
      userAskedToAddTable(
        "add table with rinse acceptance criteria for all equipments"
      )
    ).toBe(true);
    expect(
      userAskedToAddTable("dont remove this table. add a new one with rinse volumes")
    ).toBe(true);
  });

  it("does not treat explicit remove as add", () => {
    expect(userExplicitlyAskedToRemoveTable("delete table 13")).toBe(true);
    expect(userAskedToAddTable("delete table 13 and add a new one")).toBe(true);
  });

  it("blocks delete_table on 11.0 when user asked to add", () => {
    const hint = cvpAcceptanceLimitsDeleteBlocked({
      documentType: "cleaning_verification_protocol",
      section: "cvp_acceptance_limits",
      operationKind: "delete_table",
      userText: "add table with rinse acceptance criteria for all equipments",
      reasoning:
        "Remove Table 13 to replace it with the complete per-equipment rinse acceptance criteria table.",
    });
    expect(hint).toContain("do not delete_table");
    expect(hint).toContain("insert_rows");
  });

  it("allows delete when user explicitly asked to remove", () => {
    expect(
      cvpAcceptanceLimitsDeleteBlocked({
        documentType: "cleaning_verification_protocol",
        section: "cvp_acceptance_limits",
        operationKind: "delete_table",
        userText: "please delete the duplicate rinse limit calculation table",
      })
    ).toBeNull();
  });

  it("ignores other document types and sections", () => {
    expect(
      cvpAcceptanceLimitsDeleteBlocked({
        documentType: "investigation_report",
        section: "cvp_acceptance_limits",
        operationKind: "delete_table",
        userText: "add a table",
      })
    ).toBeNull();
  });
});
