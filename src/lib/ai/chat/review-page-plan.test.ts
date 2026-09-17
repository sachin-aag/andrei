import { describe, expect, it } from "vitest";
import { REVIEW_PAGE_FETCH_CAP } from "@/lib/ai/chat/document-review";
import {
  REVIEW_OBJECTIVE_PAGE_FLOOR,
  coverageKeySatisfiesObjective,
  coverageObjectiveDigest,
  neighborFillPages,
  objectiveTokens,
  planReviewPages,
  scoreReviewPage,
} from "./review-page-plan";

describe("planReviewPages", () => {
  it("keeps every scored page when the matching set is under the safety cap", () => {
    const pages = Array.from({ length: 40 }, (_, i) => ({
      attachmentId: i < 20 ? "cal" : "env",
      pageNumber: (i % 20) + 1,
      filename: i < 20 ? "calibration.pdf" : "monitoring.pdf",
      transcript: i < 20 ? "certificate of calibration" : "viable count",
      pageContext: i < 20 ? "Calibration certificate" : "EM excursion",
      outlineTitle: i < 20 ? "Calibration" : "Monitoring",
      identifiers: i < 20 ? ["CAL-1"] : ["EM-1"],
    }));
    const selected = planReviewPages(pages, "elr_calibration", 2500);
    expect(selected).toHaveLength(20);
    expect(selected.every((page) => page.attachmentId === "cal")).toBe(true);
  });

  it("scores identifier and heading matches above unrelated pages", () => {
    expect(objectiveTokens("elr_calibration")).toContain("calibration");
    expect(
      scoreReviewPage(
        {
          attachmentId: "a",
          outlineTitle: "Calibration certificates",
          identifiers: ["CAL-12"],
          transcript: "as found / as left",
        },
        "elr_calibration"
      )
    ).toBeGreaterThan(
      scoreReviewPage(
        {
          attachmentId: "b",
          outlineTitle: "Environmental monitoring",
          identifiers: ["EM-1"],
          transcript: "CFU/plate",
        },
        "elr_calibration"
      )
    );
  });

  it("does not pad leftover pages once enough objective pages are queued", () => {
    const pages = [
      ...Array.from({ length: 40 }, (_, i) => ({
        attachmentId: "cal",
        pageNumber: i + 1,
        filename: "calibration.pdf",
        transcript: `certificate ${i}`,
        outlineTitle: "Calibration",
        identifiers: ["CAL-1"],
      })),
      ...Array.from({ length: 40 }, (_, i) => ({
        attachmentId: "other",
        pageNumber: i + 1,
        filename: "other.pdf",
        transcript: `unrelated ${i}`,
        outlineTitle: "Appendix",
        identifiers: [] as string[],
      })),
    ];
    const selected = planReviewPages(pages, "calibration certificates", 50);
    expect(selected).toHaveLength(40);
    expect(selected.filter((page) => page.attachmentId === "cal").length).toBe(
      40
    );
    expect(
      selected.filter((page) => page.attachmentId === "other").length
    ).toBe(0);
  });

  it("fills nearby pages from the same file when few pages score", () => {
    const pages = [
      ...Array.from({ length: 20 }, (_, i) => ({
        attachmentId: "cal",
        pageNumber: i + 1,
        filename: "eq-log.pdf",
        transcript:
          i === 4 ? "certificate of calibration CAL-1" : `log sheet ${i}`,
        outlineTitle: i === 4 ? "Calibration" : "Daily log",
        identifiers: i === 4 ? ["CAL-1"] : ([] as string[]),
      })),
      ...Array.from({ length: 80 }, (_, i) => ({
        attachmentId: "other",
        pageNumber: i + 1,
        filename: "other.pdf",
        transcript: `unrelated ${i}`,
        outlineTitle: "Appendix",
        identifiers: [] as string[],
      })),
    ];
    const selected = planReviewPages(pages, "elr_calibration", 2500);
    expect(selected).toHaveLength(REVIEW_OBJECTIVE_PAGE_FLOOR);
    expect(selected.every((page) => page.attachmentId === "cal")).toBe(true);
    expect(selected.some((page) => page.pageNumber === 5)).toBe(true);
  });

  it("does not walk leftover files when one page matches and has no neighbors", () => {
    const pages = [
      {
        attachmentId: "cal",
        pageNumber: 1,
        filename: "calibration.pdf",
        transcript: "certificate of calibration",
        outlineTitle: "Calibration",
        identifiers: ["CAL-1"],
      },
      ...Array.from({ length: 80 }, (_, i) => ({
        attachmentId: "other",
        pageNumber: i + 1,
        filename: "other.pdf",
        transcript: `unrelated ${i}`,
        outlineTitle: "Appendix",
        identifiers: [] as string[],
      })),
    ];
    const selected = planReviewPages(pages, "elr_calibration", 2500);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.attachmentId).toBe("cal");
  });

  it("does not queue a 231-page calibration planner for a QMS walk", () => {
    const pages = [
      ...Array.from({ length: 231 }, (_, i) => ({
        attachmentId: "planner",
        pageNumber: i + 1,
        filename: "Master Annual Calibration Planner PR.pdf",
        transcript: `Document No. CAL-PR-014 Date 12/01/2025 row ${i}`,
        pageContext: "Annual calibration planner",
        outlineTitle: "Planner",
        identifiers: [] as string[],
      })),
      {
        attachmentId: "prqr",
        pageNumber: 22,
        filename: "PRQR-25-PR-005 Report.pdf",
        transcript:
          "QMS records Type CAPA Document Reference No. CAPA/25/01 Date Initiated 03/02/2025 Qualification Impact N",
        outlineTitle: "QMS since last PRQ",
        identifiers: ["CAPA/25/01"],
      },
    ];
    const selected = planReviewPages(pages, "elr_qms", 2500);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.attachmentId).toBe("prqr");
  });

  it("samples a small floor from non-conflicting files when nothing matches", () => {
    const pages = [
      ...Array.from({ length: 231 }, (_, i) => ({
        attachmentId: "planner",
        pageNumber: i + 1,
        filename: "Master Annual Calibration Planner PR.pdf",
        transcript: `unrelated ${i}`,
        outlineTitle: "Appendix",
        identifiers: [] as string[],
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        attachmentId: "other",
        pageNumber: i + 1,
        filename: "E-PR-068.pdf",
        transcript: `name plate ${i}`,
        outlineTitle: "Appendix",
        identifiers: [] as string[],
      })),
    ];
    const selected = planReviewPages(pages, "elr_qms", 2500);
    expect(selected).toHaveLength(REVIEW_OBJECTIVE_PAGE_FLOOR);
    expect(selected.every((page) => page.attachmentId === "other")).toBe(true);
  });

  it("samples a small floor when nothing matches", () => {
    const pages = Array.from({ length: 80 }, (_, i) => ({
      attachmentId: i < 40 ? "a" : "b",
      pageNumber: (i % 40) + 1,
      filename: i < 40 ? "a.pdf" : "b.pdf",
      transcript: `unrelated ${i}`,
      outlineTitle: "Appendix",
      identifiers: [] as string[],
    }));
    const selected = planReviewPages(pages, "elr_calibration", 2500);
    expect(selected).toHaveLength(REVIEW_OBJECTIVE_PAGE_FLOOR);
  });

  it("does not silently drop to 300 when under the fetch cap", () => {
    expect(REVIEW_PAGE_FETCH_CAP).toBeGreaterThan(300);
    expect(REVIEW_OBJECTIVE_PAGE_FLOOR).toBeLessThan(40);
    expect(coverageObjectiveDigest("  Calibration  Walk ")).toBe(
      "calibration walk"
    );
  });

  it("queues schema-matching monitoring pages across files, not a protocol that only says monitoring", () => {
    const pages = [
      {
        attachmentId: "pqp",
        pageNumber: 11,
        filename: "PQP-24-PR-097-Rev.no-01.pdf",
        transcript:
          "The machine is equipped with the following connections for monitoring systems",
        outlineTitle: "Protocol",
        identifiers: [] as string[],
      },
      {
        attachmentId: "prqr",
        pageNumber: 9,
        filename: "PRQR-25-PR-005 Report.pdf",
        transcript:
          "Non-Viable Particulate Monitoring (Grade A LAF) 23/07/2024 – 23/07/2025",
        outlineTitle: "Environmental monitoring",
        identifiers: ["PRQR-25-PR-005"],
      },
      {
        attachmentId: "prqp",
        pageNumber: 12,
        filename: "PRQP-24-PR-057 Protocol.pdf",
        transcript: "Viable Environmental Monitoring (Air & Surface)",
        outlineTitle: "EM",
        identifiers: ["PRQP-24-PR-057"],
      },
      {
        attachmentId: "epr",
        pageNumber: 1,
        filename: "E-PR-068 and E-PR-071.pdf",
        transcript: "Equipment identity filling and capping machine E/PR/070",
        outlineTitle: "Name plate",
        identifiers: ["E/PR/070"],
      },
    ];
    const selected = planReviewPages(pages, "elr_monitoring", 2500);
    expect(selected.map((page) => page.attachmentId).sort()).toEqual([
      "prqp",
      "prqr",
    ]);
    expect(scoreReviewPage(pages[0]!, "elr_monitoring")).toBe(0);
    expect(scoreReviewPage(pages[1]!, "elr_monitoring")).toBeGreaterThan(0);
    expect(scoreReviewPage(pages[2]!, "elr_monitoring")).toBeGreaterThan(0);
  });

  it("queues PRQR environmental methods over CSV-OQ and RTM URS pages", () => {
    const header =
      "UNCONTROLLED COPY Sign/Date Reviewed By QA Confidential and Proprietary ";
    const pages = [
      {
        attachmentId: "csv",
        pageNumber: 1,
        filename: "CSV-OQ-PR-055 PART-1.pdf",
        transcript:
          "The machine is equipped with connections for environmental monitoring systems 12/01/2025",
        outlineTitle: "URS",
        identifiers: [] as string[],
      },
      {
        attachmentId: "rtm",
        pageNumber: 2,
        filename: "RTM for E-PR-068.pdf",
        transcript: "URS environmental monitoring sampling ports Date 01/04/2025",
        outlineTitle: "RTM",
        identifiers: [] as string[],
      },
      {
        attachmentId: "prqr",
        pageNumber: 40,
        filename: "PRQR-25-PR-005 Report.pdf",
        transcript: `${header}${".".repeat(900)}Non-Viable Particulate Monitoring Settle Plate 23/07/2024`,
        outlineTitle: "Environmental monitoring",
        identifiers: ["PRQR-25-PR-005"],
      },
    ];
    const selected = planReviewPages(pages, "elr_monitoring", 2500);
    expect(selected.map((page) => page.attachmentId)).toEqual(["prqr"]);
  });

  it("queues PRQR methods and the alarm-trend PDF together", () => {
    const header =
      "UNCONTROLLED COPY Sign/Date Reviewed By QA Confidential and Proprietary ";
    const pages = [
      {
        attachmentId: "csv",
        pageNumber: 1,
        filename: "CSV-OQ-PR-055 PART-1.pdf",
        transcript:
          "The machine is equipped with connections for environmental monitoring systems 12/01/2025",
        outlineTitle: "URS",
        identifiers: [] as string[],
      },
      {
        attachmentId: "prqr",
        pageNumber: 40,
        filename: "PRQR-25-PR-005 Report.pdf",
        transcript: `${header}${".".repeat(900)}Non-Viable Particulate Monitoring Settle Plate 23/07/2024`,
        outlineTitle: "Environmental monitoring",
        identifiers: ["PRQR-25-PR-005"],
      },
      {
        attachmentId: "alarm",
        pageNumber: 2,
        filename: "Alarm trend Q2 2025.pdf",
        transcript:
          "Alarm Description FM Nitrogen Not Available Count 1950 Direct Impact N",
        outlineTitle: "Alarm trend",
        identifiers: [] as string[],
      },
    ];
    const selected = planReviewPages(pages, "elr_monitoring", 2500);
    expect(selected.map((page) => page.attachmentId).sort()).toEqual([
      "alarm",
      "prqr",
    ]);
  });

  it("queues a differential-pressure monitoring row from column hits", () => {
    const pages = [
      {
        attachmentId: "pqp",
        pageNumber: 11,
        filename: "PQP-24-PR-097.pdf",
        transcript: "connections for monitoring systems NV / V sampling ports",
        outlineTitle: "URS",
        identifiers: [] as string[],
      },
      {
        attachmentId: "prqr",
        pageNumber: 14,
        filename: "PRQR-25-PR-005 Report.pdf",
        transcript:
          "Differential pressure Grade A LAF 23/07/2024 – 23/07/2025 Excursion N",
        outlineTitle: "LAF",
        identifiers: ["PRQR-25-PR-005"],
      },
    ];
    const selected = planReviewPages(pages, "elr_monitoring", 2500);
    expect(selected.map((page) => page.attachmentId)).toEqual(["prqr"]);
  });
});

describe("neighborFillPages", () => {
  it("prefers adjacent page numbers in the same attachment", () => {
    const pages = Array.from({ length: 6 }, (_, i) => ({
      attachmentId: "cal",
      pageNumber: i + 1,
      filename: "calibration.pdf",
      transcript: i === 2 ? "calibration" : `other ${i}`,
    }));
    const hit = pages[2]!;
    const neighbors = neighborFillPages(pages, [hit], 2);
    expect(neighbors.map((page) => page.pageNumber)).toEqual([2, 4]);
  });
});

describe("coverageKeySatisfiesObjective", () => {
  it("matches a section key to a same-section digest or overlapping tokens", () => {
    expect(
      coverageKeySatisfiesObjective(
        "att:10:run|obj:elr_calibration",
        "elr_calibration"
      )
    ).toBe(true);
    expect(
      coverageKeySatisfiesObjective(
        "att:10:run|obj:calibration of associated instruments",
        "elr_calibration"
      )
    ).toBe(true);
  });

  it("does not treat a qualification finish as covering calibration", () => {
    expect(
      coverageKeySatisfiesObjective(
        "att:10:run|obj:elr_qualification",
        "elr_calibration"
      )
    ).toBe(false);
    expect(
      coverageKeySatisfiesObjective("att:10:run", "elr_calibration")
    ).toBe(false);
  });
});
