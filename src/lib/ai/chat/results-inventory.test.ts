import { describe, expect, it } from "vitest";
import {
  compareDraftedInventory,
  selectRecommendedInventory,
  type InventoryFinding,
} from "./results-inventory";
import { REV_U_REPORT_ONLY_REQ_IDS } from "@/lib/document-types/convergent/rev-u-report-only-req-ids";

function finding(
  partial: Partial<InventoryFinding> &
    Pick<InventoryFinding, "heading" | "summary" | "identifiers">
): InventoryFinding {
  return {
    attachmentId: "att_b",
    filename: "Appendix-B.pdf",
    pageNumber: 4,
    ...partial,
  };
}

describe("selectRecommendedInventory", () => {
  it("prefers a Requirements Verified table over incidental protocol IDs", () => {
    const inventory = selectRecommendedInventory([
      finding({
        heading: "REQUIREMENTS VERIFIED",
        summary: REV_U_REPORT_ONLY_REQ_IDS.join(" "),
        identifiers: [...REV_U_REPORT_ONLY_REQ_IDS],
      }),
      finding({
        pageNumber: 31,
        heading: "TABLE 4 SOFTWARE REQUIREMENTS",
        summary: "SW-SS-1 SW-AR-3 SW-SST-1 protocol body",
        identifiers: ["SW-SS-1", "SW-AR-3", "SW-SST-1"],
      }),
    ]);
    expect(inventory.sourceKind).toBe("verified_table");
    expect(inventory.confidence).toBe("high");
    expect(inventory.ids).toEqual([...REV_U_REPORT_ONLY_REQ_IDS]);
    expect(inventory.citations).toEqual([
      { filename: "Appendix-B.pdf", pageNumber: 4 },
    ]);
  });

  it("falls back to a datasheet TOC / partial-execution list", () => {
    const inventory = selectRecommendedInventory([
      finding({
        heading: "13.1 DATASHEETS",
        summary: "Partial execution SW-IN-1 SW-IN-1.1 SW-LWB-4",
        identifiers: ["SW-IN-1", "SW-IN-1.1", "SW-LWB-4"],
      }),
    ]);
    expect(inventory.sourceKind).toBe("executed_set");
    expect(inventory.confidence).toBe("medium");
    expect(inventory.ids).toEqual(["SW-IN-1", "SW-IN-1.1", "SW-LWB-4"]);
  });

  it("recommends only requirement rows from a mechanical Requirements Verified page", () => {
    const inventory = selectRecommendedInventory([
      finding({
        heading: "Table 3: Hardware Requirement Results per Test Plan 825-00104 Rev. B",
        summary:
          "M3-HRS-GN-001 All Components shall be RoHS compliant. Refer to components of " +
          "SUB-00464, SUB-00458 and SUB-00445 for updated RoHS documentation. Pass. " +
          "M3-HRS-BD-011 Not Applicable, refer to Deviation #2 raised against TOP-00017 " +
          "under DCO-02058. N/A.",
        identifiers: [
          "M3-HRS-GN-001",
          "M3-HRS-BD-011",
          "SUB-00464",
          "TOP-00017",
          "DCO-02058",
        ],
      }),
    ]);
    expect(inventory.sourceKind).toBe("verified_table");
    // Prefixes survive (not "HRS-GN-001") and part numbers are not rows.
    expect(inventory.ids).toEqual(["M3-HRS-GN-001", "M3-HRS-BD-011"]);
  });

  it("drops manufacturing serials that share a requirement's segment count", () => {
    const inventory = selectRecommendedInventory([
      finding({
        heading: "REQUIREMENTS VERIFIED",
        summary:
          "M3-SYS-FN-037 verified on SEN-0724-10001 and P33-0724-10002. Pass.",
        identifiers: ["M3-SYS-FN-037", "SEN-0724-10001", "P33-0724-10002"],
      }),
    ]);
    expect(inventory.ids).toEqual(["M3-SYS-FN-037"]);
  });
});

describe("compareDraftedInventory", () => {
  it("flags a family-collapsed 13-row draft against the Rev U Report Only list", () => {
    const drafted = [
      "SW-IN-1",
      "SW-IN-2",
      "SW-WLP-24",
      "SW-WLP-5",
      "SW-SST-5",
      "SW-SST-6",
      "SW-PA-1",
      "SW-SIB-3",
      "SW-EH-1",
      "SW-SDT-1",
      "SW-SS-4",
      "SW-LCB-1",
      "SW-LWB-4",
    ];
    const comparison = compareDraftedInventory(drafted, REV_U_REPORT_ONLY_REQ_IDS);
    expect(comparison.ok).toBe(false);
    expect(comparison.missingIds).toEqual(
      expect.arrayContaining([
        "SW-IN-1.1",
        "SW-WLP-24.1",
        "SW-SST-5.1.1",
        "SW-SST-6.4",
        "SW-EH-1.2",
      ])
    );
    expect(comparison.collapsedIds).toEqual(
      expect.arrayContaining([
        { drafted: "SW-SST-5", expected: "SW-SST-5.1.1" },
        { drafted: "SW-EH-1", expected: "SW-EH-1.2" },
      ])
    );
  });
});
