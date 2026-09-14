import { describe, expect, it } from "vitest";
import { REVIEW_PAGE_FETCH_CAP } from "@/lib/ai/chat/document-review";
import {
  coverageKeySatisfiesObjective,
  coverageObjectiveDigest,
  objectiveTokens,
  planReviewPages,
  scoreReviewPage,
} from "./review-page-plan";

describe("planReviewPages", () => {
  it("keeps every page when the set is under the safety cap", () => {
    const pages = Array.from({ length: 40 }, (_, i) => ({
      attachmentId: i < 20 ? "cal" : "env",
      filename: i < 20 ? "calibration.pdf" : "monitoring.pdf",
      transcript: i < 20 ? "certificate of calibration" : "viable count",
      pageContext: i < 20 ? "Calibration certificate" : "EM excursion",
      outlineTitle: i < 20 ? "Calibration" : "Monitoring",
      identifiers: i < 20 ? ["CAL-1"] : ["EM-1"],
    }));
    expect(planReviewPages(pages, "elr_calibration", 2500)).toHaveLength(40);
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

  it("fair-shares leftover pages when the safety cap binds", () => {
    const pages = [
      ...Array.from({ length: 40 }, (_, i) => ({
        attachmentId: "cal",
        filename: "calibration.pdf",
        transcript: `certificate ${i}`,
        outlineTitle: "Calibration",
        identifiers: ["CAL-1"],
      })),
      ...Array.from({ length: 40 }, (_, i) => ({
        attachmentId: "other",
        filename: "other.pdf",
        transcript: `unrelated ${i}`,
        outlineTitle: "Appendix",
        identifiers: [] as string[],
      })),
    ];
    const selected = planReviewPages(pages, "calibration certificates", 50);
    expect(selected).toHaveLength(50);
    expect(selected.filter((page) => page.attachmentId === "cal").length).toBe(
      40
    );
    expect(
      selected.filter((page) => page.attachmentId === "other").length
    ).toBe(10);
  });

  it("does not silently drop to 300 when under the fetch cap", () => {
    expect(REVIEW_PAGE_FETCH_CAP).toBeGreaterThan(300);
    expect(coverageObjectiveDigest("  Calibration  Walk ")).toBe(
      "calibration walk"
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
