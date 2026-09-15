import { describe, expect, it } from "vitest";
import {
  hasTypedSectionNoun,
  inventoryColumnNeedles,
  inventorySectionForObjective,
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

describe("scoreInventoryReviewPage", () => {
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
});
