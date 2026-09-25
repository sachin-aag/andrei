import { describe, expect, it } from "vitest";
import { REVIEW_PAGE_FETCH_CAP } from "@/lib/ai/chat/document-review";
import {
  REVIEW_INVENTORY_WALK_CAP,
  REVIEW_OBJECTIVE_PAGE_FLOOR,
  REVIEW_PREFERRED_MISSING_PAGE_CAP,
  coverageKeySatisfiesObjective,
  coverageObjectiveDigest,
  isQsrInventoryReviewObjective,
  isQsrLifecycleCoverObjective,
  neighborFillPages,
  objectiveTokens,
  planReviewPages,
  REVIEW_LIFECYCLE_COVER_PAGES_PER_FILE,
  samplePagesAcrossAttachment,
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
    expect(
      coverageObjectiveDigest(
        "Extract document details for section 3 qualification documents (covers)"
      )
    ).toBe("qsr_qualification_documents");
    expect(coverageObjectiveDigest("qsr_qualification_documents")).toBe(
      "qsr_qualification_documents"
    );
    expect(
      coverageObjectiveDigest("QSR Table 3 qualification document numbers")
    ).toBe("qsr_qualification_documents");
    expect(
      coverageObjectiveDigest("qsr references for the qualification summary")
    ).toBe("qsr_references");
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

  it("does not queue the alarm-trend PDF on a monitoring walk", () => {
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
    expect(selected.map((page) => page.attachmentId)).toEqual(["prqr"]);
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

  it("queues PRQR and PMC on breakdowns even when a few FAT pages score", () => {
    const fatHits = Array.from({ length: 3 }, (_, i) => ({
      attachmentId: "fat",
      pageNumber: i + 1,
      filename: "FAT-OQ-PR-012.pdf",
      transcript: `Document Reference FAT-OQ-12 Date 12/0${i + 1}/2025 Corrective Action Taken replace seal`,
      outlineTitle: "FAT",
      identifiers: [] as string[],
    }));
    const csvHeaders = Array.from({ length: 6 }, (_, i) => ({
      attachmentId: "csv",
      pageNumber: i + 1,
      filename: "CSV-IQ-PR-078 PART-1.pdf",
      transcript: `Document Reference No. CSV-IQ-PR-078 Date 12/0${i + 1}/2025`,
      outlineTitle: "IQ",
      identifiers: [] as string[],
    }));
    const prqrCovers = Array.from({ length: 20 }, (_, i) => ({
      attachmentId: "prqr",
      pageNumber: i + 1,
      filename: "PRQR-25-PR-060 Report.pdf",
      transcript: `Document No. PRQR-25-PR-060 Date 12/01/2025 cover ${i}`,
      outlineTitle: "Cover",
      identifiers: [] as string[],
    }));
    const pmcCovers = Array.from({ length: 8 }, (_, i) => ({
      attachmentId: "pmc",
      pageNumber: i + 1,
      filename: "Master PMC.pdf",
      transcript: `Document No. PMC-01 Date 12/01/2025 log ${i}`,
      outlineTitle: "PMC",
      identifiers: [] as string[],
    }));
    const alarm = {
      attachmentId: "alarm",
      pageNumber: 2,
      filename: "Alarm trend Q2 2025.pdf",
      transcript: "Alarm Description FM Nitrogen Not Available Count 1951",
      outlineTitle: "Alarm trend",
      identifiers: [] as string[],
    };
    const selected = planReviewPages(
      [...csvHeaders, ...fatHits, alarm, ...prqrCovers, ...pmcCovers],
      "elr_breakdowns",
      2500
    );
    const ids = new Set(selected.map((page) => page.attachmentId));
    expect(ids.has("prqr")).toBe(true);
    expect(ids.has("pmc")).toBe(true);
    expect(ids.has("alarm")).toBe(false);
    expect(selected.filter((page) => page.attachmentId === "prqr").length).toBe(
      REVIEW_OBJECTIVE_PAGE_FLOOR
    );
    expect(selected.filter((page) => page.attachmentId === "csv").length).toBe(
      0
    );
  });

  it("samples preferred CCF/PRQR pages on QMS instead of walking every page", () => {
    const capaHit = {
      attachmentId: "capa",
      pageNumber: 1,
      filename: "CAPA-25-01.pdf",
      transcript:
        "QMS records Type CAPA Document Reference No. CAPA/25/01 Date Initiated 03/02/2025 Qualification Impact N",
      outlineTitle: "CAPA",
      identifiers: ["CAPA/25/01"],
    };
    const ccf = Array.from({ length: 200 }, (_, i) => ({
      attachmentId: "ccf",
      pageNumber: i + 1,
      filename: "CCF-24-PR-010.pdf",
      transcript: `change control cover ${i}`,
      outlineTitle: "Cover",
      identifiers: [] as string[],
    }));
    const prqr = Array.from({ length: 273 }, (_, i) => ({
      attachmentId: "prqr",
      pageNumber: i + 1,
      filename: "PRQR-25-PR-005 Report.pdf",
      transcript: `cover ${i}`,
      outlineTitle: "Cover",
      identifiers: [] as string[],
    }));
    const selected = planReviewPages(
      [...ccf, capaHit, ...prqr],
      "elr_qms",
      2500
    );
    const byAttachment = selected.reduce<Record<string, number>>((acc, page) => {
      acc[page.attachmentId] = (acc[page.attachmentId] ?? 0) + 1;
      return acc;
    }, {});
    expect(byAttachment.capa).toBe(1);
    expect(byAttachment.ccf).toBe(REVIEW_OBJECTIVE_PAGE_FLOOR);
    expect(byAttachment.prqr).toBe(REVIEW_OBJECTIVE_PAGE_FLOOR);
    expect(selected.length).toBeLessThanOrEqual(
      1 + REVIEW_PREFERRED_MISSING_PAGE_CAP
    );
    const ccfPages = selected
      .filter((page) => page.attachmentId === "ccf")
      .map((page) => page.pageNumber ?? 0);
    expect(Math.max(...ccfPages)).toBeGreaterThan(REVIEW_OBJECTIVE_PAGE_FLOOR);
  });

  it("caps a scored CCF flood so QMS remaining-section can finish in one continue", () => {
    const pages = Array.from({ length: 200 }, (_, i) => ({
      attachmentId: "ccf",
      pageNumber: i + 1,
      filename: "CCF-24-PR-010.pdf",
      transcript: `Document Reference CCF-24-PR-010 Date 12/01/2025 change ${i}`,
      outlineTitle: "Change control",
      identifiers: [`CCF-24-PR-010`],
    }));
    expect(scoreReviewPage(pages[0]!, "elr_qms")).toBeGreaterThan(0);
    const selected = planReviewPages(pages, "elr_qms", 2500);
    expect(selected).toHaveLength(REVIEW_INVENTORY_WALK_CAP);
    expect(selected.every((page) => page.attachmentId === "ccf")).toBe(true);
    const pageNumbers = selected.map((page) => page.pageNumber ?? 0);
    expect(Math.max(...pageNumbers)).toBeGreaterThan(REVIEW_OBJECTIVE_PAGE_FLOOR);
    expect(Math.max(...pageNumbers)).toBeGreaterThan(100);
  });

  it("keeps a small scored calibration walk under the inventory cap", () => {
    const pages = Array.from({ length: 40 }, (_, i) => ({
      attachmentId: "cal",
      pageNumber: i + 1,
      filename: "calibration.pdf",
      transcript: `certificate of calibration ${i}`,
      outlineTitle: "Calibration",
      identifiers: ["CAL-1"],
    }));
    const selected = planReviewPages(pages, "elr_calibration", 2500);
    expect(selected).toHaveLength(40);
  });

  it("does not cap a DV catalog walk that is not an ELR inventory", () => {
    const pages = Array.from({ length: 80 }, (_, i) => ({
      attachmentId: "catalog",
      pageNumber: i + 1,
      filename: "solea-requirements.pdf",
      transcript: `requirement REQ-${i + 1} acceptance criteria`,
      outlineTitle: "Requirements",
      identifiers: [`REQ-${i + 1}`],
    }));
    const selected = planReviewPages(pages, "every requirement", 2500);
    expect(selected).toHaveLength(80);
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

describe("samplePagesAcrossAttachment", () => {
  it("spreads across the file instead of taking only the cover", () => {
    const pages = Array.from({ length: 200 }, (_, i) => ({ page: i + 1 }));
    expect(samplePagesAcrossAttachment(pages, 8).map((row) => row.page)).toEqual([
      1, 29, 58, 86, 115, 143, 172, 200,
    ]);
    expect(samplePagesAcrossAttachment(pages, 250).map((row) => row.page)).toHaveLength(
      200
    );
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
    expect(
      coverageKeySatisfiesObjective(
        "att:10:run|obj:extract document details for section 3 qualification documents (covers)",
        "qsr_qualification_documents"
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

  it("prefers URS pages for a QSR RTM review and does not demote them", () => {
    expect(
      scoreReviewPage(
        {
          attachmentId: "urs",
          filename: "URS-GLR-1301.pdf",
          transcript: "Safety Requirements URS-44 Emergency Stop",
          outlineTitle: "Safety requirements",
        },
        "qsr_rtm_safety"
      )
    ).toBeGreaterThan(
      scoreReviewPage(
        {
          attachmentId: "dq",
          filename: "DQ-GLR-1301.pdf",
          transcript: "Design qualification protocol",
          outlineTitle: "DQ",
        },
        "qsr_rtm_safety"
      )
    );

    const selected = planReviewPages(
      [
        {
          attachmentId: "dq",
          pageNumber: 1,
          filename: "DQ-GLR-1301.pdf",
          transcript: "unrelated protocol text",
        },
        {
          attachmentId: "urs",
          pageNumber: 1,
          filename: "URS-GLR-1301.pdf",
          transcript: "unrelated requirement text",
        },
      ],
      "qsr_rtm_safety",
      REVIEW_OBJECTIVE_PAGE_FLOOR
    );
    expect(selected.some((page) => page.attachmentId === "urs")).toBe(true);
  });
});

describe("QSR lifecycle cover review", () => {
  it("treats Table 3 and References as cover-page walks, not RTM", () => {
    expect(isQsrLifecycleCoverObjective("qsr_qualification_documents")).toBe(
      true
    );
    expect(isQsrLifecycleCoverObjective("qualification documents")).toBe(true);
    expect(
      isQsrLifecycleCoverObjective("document number revision and status")
    ).toBe(true);
    expect(isQsrLifecycleCoverObjective("qsr_references")).toBe(true);
    expect(isQsrLifecycleCoverObjective("qsr_rtm_process")).toBe(false);
    expect(isQsrLifecycleCoverObjective("elr_qualification")).toBe(false);
    expect(
      isQsrInventoryReviewObjective("qualification documents", "qsr_rtm_gmp")
    ).toBe(true);
    expect(isQsrInventoryReviewObjective("elr_calibration")).toBe(false);
  });

  it("queues the first two pages of every lifecycle file including URS", () => {
    const files = [
      { id: "urs", filename: "URS-GLR-1301.pdf" },
      { id: "dq", filename: "DQ-GLR-1301.pdf" },
      { id: "iq", filename: "IQ-GLR-1301.pdf" },
      { id: "oq", filename: "OQ-GLR-1301.pdf" },
      { id: "pq", filename: "PQ-GLR-1301.pdf" },
    ];
    const pages = files.flatMap((file) =>
      Array.from({ length: 40 }, (_, i) => ({
        attachmentId: file.id,
        pageNumber: i + 1,
        filename: file.filename,
        transcript:
          i < 2
            ? `Protocol No. ${file.id.toUpperCase()}-P Report No. ${file.id.toUpperCase()}-R Rev 01`
            : `qualification body page ${i + 1} acceptance criteria`,
        outlineTitle: i < 2 ? "Cover" : "Protocol body",
        identifiers: i < 2 ? [`${file.id.toUpperCase()}-P`] : ([] as string[]),
      }))
    );
    const selected = planReviewPages(
      pages,
      "qsr_qualification_documents",
      2500
    );
    expect(selected).toHaveLength(
      files.length * REVIEW_LIFECYCLE_COVER_PAGES_PER_FILE
    );
    expect(selected.every((page) => (page.pageNumber ?? 99) <= 2)).toBe(true);
    expect(selected.some((page) => page.attachmentId === "urs")).toBe(true);
    expect(
      selected.filter((page) => page.attachmentId === "iq")
    ).toHaveLength(REVIEW_LIFECYCLE_COVER_PAGES_PER_FILE);
  });
});
