import { describe, expect, it } from "vitest";
import {
  filenameConflictsWithInventoryObjective,
  hasTypedSectionNoun,
  inventoryColumnNeedles,
  inventoryReadyIdsForObjective,
  inventorySectionForObjective,
  isPreferredInventoryFilename,
  preferredInventoryEvidenceSkipped,
  scoreInventoryReviewPage,
} from "./inventory-review-schema";

describe("inventorySectionForObjective", () => {
  it("maps a section key and a plain-language objective", () => {
    expect(inventorySectionForObjective("elr_monitoring")).toBe(
      "elr_monitoring"
    );
    expect(inventorySectionForObjective("extract monitoring records")).toBe(
      "elr_monitoring"
    );
    expect(inventorySectionForObjective("calibration certificates")).toBe(
      "elr_calibration"
    );
    expect(inventorySectionForObjective("every requirement")).toBeNull();
    expect(inventorySectionForObjective("qsr_rtm_safety")).toBe("qsr_rtm_safety");
    expect(inventorySectionForObjective("qsr_operating_range")).toBe(
      "qsr_operating_range"
    );
    expect(
      isPreferredInventoryFilename("URS-GLR-1301.pdf", "qsr_rtm_safety")
    ).toBe(true);
    expect(
      isPreferredInventoryFilename("DQ-GLR-1301.pdf", "qsr_rtm_safety")
    ).toBe(false);
  });
});

describe("inventoryColumnNeedles", () => {
  it("uses Monitoring column headers, not Grade A row values", () => {
    const needles = inventoryColumnNeedles("elr_monitoring");
    expect(needles).toContain("monitoring parameter");
    expect(needles).toContain("period covered");
    expect(needles).toContain("excursion");
    expect(needles).not.toContain("non-viable");
    expect(needles).not.toContain("glove monitoring");
  });

  it("uses Access Control role columns, not a grant/revoke log", () => {
    const needles = inventoryColumnNeedles("elr_access_control");
    expect(needles).toContain("operator");
    expect(needles).toContain("supervisor");
    expect(needles).toContain("maintenance");
    expect(needles).toContain("administrator");
    expect(needles).toContain("privilege matrix");
    expect(needles).not.toContain("user name");
    expect(needles).not.toContain("granted");
  });

  it("uses CSV revalidation due date, not only last validation", () => {
    const needles = inventoryColumnNeedles("elr_csv_status");
    expect(needles).toContain("revalidation due date");
    expect(needles).toContain("last validation revalidation date");
  });
});

describe("hasTypedSectionNoun", () => {
  it("accepts a result name and rejects URS wording", () => {
    expect(hasTypedSectionNoun("non-viable particulate monitoring", "monitoring")).toBe(
      true
    );
    expect(hasTypedSectionNoun("connections for monitoring systems", "monitoring")).toBe(
      false
    );
    expect(
      hasTypedSectionNoun("approval page for performance qualification", "qualification")
    ).toBe(false);
  });
});

describe("filenameConflictsWithInventoryObjective", () => {
  it("drops a calibration planner filename from a QMS walk and keeps PRQR", () => {
    expect(
      filenameConflictsWithInventoryObjective(
        "Master Annual Calibration Planner PR.pdf",
        "elr_qms"
      )
    ).toBe(true);
    expect(
      filenameConflictsWithInventoryObjective(
        "PRQR-25-PR-005 Report.pdf",
        "elr_qms"
      )
    ).toBe(false);
    expect(
      filenameConflictsWithInventoryObjective(
        "Master Annual Calibration Planner PR.pdf",
        "elr_calibration"
      )
    ).toBe(false);
    expect(
      filenameConflictsWithInventoryObjective(
        "SCADA Alarms Trend Q1 2025.pdf",
        "elr_monitoring"
      )
    ).toBe(true);
    expect(
      filenameConflictsWithInventoryObjective(
        "Alarm trend Q2 2025.pdf",
        "elr_breakdowns"
      )
    ).toBe(true);
    expect(
      filenameConflictsWithInventoryObjective(
        "Alarm trend Q2 2025.pdf",
        "elr_alarms"
      )
    ).toBe(false);
  });

  it("does not empty the ready set when every filename conflicts", () => {
    expect(
      inventoryReadyIdsForObjective(
        [
          {
            attachmentId: "cal",
            filename: "Master Annual Calibration Planner PR.pdf",
          },
        ],
        "elr_qms"
      )
    ).toEqual(["cal"]);
    expect(
      inventoryReadyIdsForObjective(
        [
          {
            attachmentId: "cal",
            filename: "Master Annual Calibration Planner PR.pdf",
          },
          { attachmentId: "prqr", filename: "PRQR-25-PR-005 Report.pdf" },
        ],
        "elr_qms"
      )
    ).toEqual(["prqr"]);
  });
});

describe("scoreInventoryReviewPage", () => {
  it("does not queue a calibration-planner header as QMS evidence", () => {
    expect(
      scoreInventoryReviewPage(
        {
          filename: "Master Annual Calibration Planner PR.pdf",
          transcript:
            "Document No. CAL-PR-014 Date 12/01/2025 Status Due Instrument ID TI-01",
          pageContext: "Annual calibration planner",
          outlineTitle: "Planner",
        },
        "elr_qms"
      )
    ).toBe(0);
    expect(
      scoreInventoryReviewPage(
        {
          filename: "PRQR-25-PR-005 Report.pdf",
          transcript:
            "QMS records Type CAPA Document Reference No. CAPA/25/01 Date Initiated 03/02/2025 Qualification Impact N",
          outlineTitle: "QMS since last PRQ",
        },
        "elr_qms"
      )
    ).toBeGreaterThan(0);
  });

  it("queues PRQR/PRQP result pages and not URS ports or a name plate", () => {
    expect(
      scoreInventoryReviewPage(
        {
          filename: "PQP-24-PR-097-Rev.no-01.pdf",
          transcript:
            "The machine is equipped with the following connections for monitoring systems",
          outlineTitle: "Protocol",
        },
        "elr_monitoring"
      )
    ).toBe(0);
    expect(
      scoreInventoryReviewPage(
        {
          filename: "PRQR-25-PR-005 Report.pdf",
          transcript:
            "Non-Viable Particulate Monitoring (Grade A LAF) 23/07/2024 – 23/07/2025",
          outlineTitle: "Environmental monitoring",
        },
        "elr_monitoring"
      )
    ).toBeGreaterThan(0);
    expect(
      scoreInventoryReviewPage(
        {
          filename: "PRQP-24-PR-057 Protocol.pdf",
          transcript: "Viable Environmental Monitoring (Air & Surface)",
          outlineTitle: "EM",
        },
        "elr_monitoring"
      )
    ).toBeGreaterThan(0);
    expect(
      scoreInventoryReviewPage(
        {
          filename: "E-PR-068 and E-PR-071.pdf",
          transcript: "Equipment identity filling and capping machine E/PR/070",
          outlineTitle: "Name plate",
        },
        "elr_monitoring"
      )
    ).toBe(0);
  });

  it("queues a differential-pressure record from column hits, not a Grade A list", () => {
    expect(
      scoreInventoryReviewPage(
        {
          filename: "PRQR-25-PR-005 Report.pdf",
          transcript:
            "Differential pressure Grade A LAF 23/07/2024 – 23/07/2025 Excursion N",
          outlineTitle: "LAF",
        },
        "elr_monitoring"
      )
    ).toBeGreaterThan(0);
  });

  it("queues nested PRQR methods after GMP header chrome and skips CSV-OQ/RTM URS", () => {
    const header =
      "UNCONTROLLED COPY Sign/Date Reviewed By QA Confidential and Proprietary ";
    const methods =
      "Non-Viable Particulate Monitoring Settle Plate Surface and Glove LAF Velocity 23/07/2024";
    expect(
      scoreInventoryReviewPage(
        {
          filename: "PRQR-25-PR-005 Report.pdf",
          transcript: `${header}${".".repeat(900)}${methods}`,
          outlineTitle: "9.0 Environmental monitoring",
        },
        "elr_monitoring"
      )
    ).toBeGreaterThan(0);
    expect(
      scoreInventoryReviewPage(
        {
          filename: "PRQR-25-PR-005 Report.pdf",
          transcript: `${header}Approved By 12/01/2025`,
          outlineTitle: "Signature",
        },
        "elr_monitoring"
      )
    ).toBe(0);
    expect(
      scoreInventoryReviewPage(
        {
          filename: "CSV-OQ-PR-055 PART-1.pdf",
          transcript:
            "The machine is equipped with connections for environmental monitoring systems 12/01/2025",
          outlineTitle: "URS",
        },
        "elr_monitoring"
      )
    ).toBe(0);
    expect(
      scoreInventoryReviewPage(
        {
          filename: "CSV-IQ-PR-078 PART-1.pdf",
          transcript:
            "Document Reference No. CSV-IQ-PR-078 Date 12/01/2025",
          outlineTitle: "IQ",
        },
        "elr_breakdowns"
      )
    ).toBe(0);
    expect(
      scoreInventoryReviewPage(
        {
          filename: "RTM for E-PR-068.pdf",
          transcript:
            "URS environmental monitoring sampling ports Date 01/04/2025",
          outlineTitle: "RTM",
        },
        "elr_monitoring"
      )
    ).toBe(0);
  });

  it("does not queue alarm-trend pages on a monitoring walk", () => {
    expect(
      scoreInventoryReviewPage(
        {
          filename: "Alarm trend Q2 2025.pdf",
          transcript:
            "Alarm Description FM Nitrogen Not Available Count 1950 Direct Impact N",
          outlineTitle: "Alarm trend",
        },
        "elr_monitoring"
      )
    ).toBe(0);
    expect(
      preferredInventoryEvidenceSkipped(
        "elr_monitoring",
        ["PRQR-25-PR-005 Report.pdf"],
        ["Alarm trend Q2 2025.pdf"]
      )
    ).toBe(false);
    expect(
      preferredInventoryEvidenceSkipped(
        "elr_monitoring",
        ["PRQR-25-PR-005 Report.pdf", "Alarm trend Q2 2025.pdf"],
        ["CSV-OQ-PR-055 PART-1.pdf"]
      )
    ).toBe(false);
  });

  it("does not queue alarm-trend pages on a breakdowns walk", () => {
    expect(
      scoreInventoryReviewPage(
        {
          filename: "Alarm trend Q2 2025.pdf",
          transcript:
            "Alarm Description FM Nitrogen Not Available Count 1950 Direct Impact N",
          outlineTitle: "Alarm trend",
        },
        "elr_breakdowns"
      )
    ).toBe(0);
    expect(
      preferredInventoryEvidenceSkipped(
        "elr_breakdowns",
        ["Master PMC.pdf", "PRQR-25-PR-060 Report.pdf"],
        ["Alarm trend Q2 2025.pdf"]
      )
    ).toBe(false);
  });

  it("queues a SOP task×role annexure and not a user grant/revoke log", () => {
    expect(
      scoreInventoryReviewPage(
        {
          filename: "SOP-DP-PR-040-R01.pdf",
          transcript:
            "Annexure-I Access Matrix Task Operator Supervisor Maintenance Administrator Login",
          outlineTitle: "User Access Matrix",
        },
        "elr_access_control"
      )
    ).toBeGreaterThan(0);
    expect(
      scoreInventoryReviewPage(
        {
          filename: "CSV-OQ-PART-2.pdf",
          transcript:
            "User Name Role Action Granted Modified Revoked Date Document Reference",
          outlineTitle: "User list",
        },
        "elr_access_control"
      )
    ).toBe(0);
  });
});
