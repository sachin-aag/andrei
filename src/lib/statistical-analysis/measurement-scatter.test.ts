import { describe, expect, it, vi } from "vitest";
import { TORQUE_MOCK_VALUES } from "@/lib/charts/__fixtures__/torque-mock";
import type { ExtractMeasurementsResult } from "@/lib/charts/extract-measurements";
import {
  runMeasurementScatter,
  scatterFromExtraction,
} from "./measurement-scatter";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/lib/attachments/retrieval", () => ({
  listDocumentPagesForReview: vi.fn(),
  listReadyDocumentsForReport: vi.fn(),
  readDocumentPage: vi.fn(),
  searchReportDocuments: vi.fn(),
}));

function torqueExtraction(): Extract<
  ExtractMeasurementsResult,
  { status: "ok" }
> {
  return {
    status: "ok",
    query: "M3-SYS-FN-037",
    rows: TORQUE_MOCK_VALUES.map((value, index) => ({
      seriesLabel: "",
      replicateLabel: `Tip ${index + 1}`,
      value: String(value),
      numericValue: value,
      uom: "ozf-in",
      page: 1,
      attachmentId: "att-1",
    })),
    limits: { lower: 1, upper: 6 },
    uom: "ozf-in",
    sampleSizeMin: null,
    citations: [{ attachmentId: "att-1", page: 1 }],
  };
}

describe("measurement scatter", () => {
  it("builds a scatter config and chart spec from a verified extraction", () => {
    const { config, results } = scatterFromExtraction(torqueExtraction(), {
      query: "M3-SYS-FN-037",
      existingTitles: [],
    });
    expect(config.query).toBe("M3-SYS-FN-037");
    expect(config.title).toBe("M3-SYS-FN-037");
    expect(results.n).toBe(TORQUE_MOCK_VALUES.length);
    expect(results.uom).toBe("ozf-in");
    expect(results.specs).toHaveLength(1);
    expect(results.specs[0]?.points).toHaveLength(TORQUE_MOCK_VALUES.length);
    expect(results.specs[0]?.limits).toEqual({ lower: 1, upper: 6 });
    expect(results.specs[0]?.points[0]?.y).toBe(TORQUE_MOCK_VALUES[0]);
    expect(config.lsl).toBeNull();
    expect(config.usl).toBeNull();
  });

  it("lets the engineer override extracted LSL/USL", () => {
    const { config, results } = scatterFromExtraction(torqueExtraction(), {
      query: "M3-SYS-FN-037",
      lsl: 2,
      usl: 5,
      existingTitles: [],
    });
    expect(config.lsl).toBe(2);
    expect(config.usl).toBe(5);
    expect(results.specs[0]?.limits).toEqual({ lower: 2, upper: 5 });
  });

  it("overrides one side and keeps the extracted limit on the other", () => {
    const { results } = scatterFromExtraction(torqueExtraction(), {
      query: "M3-SYS-FN-037",
      lsl: 0.5,
      existingTitles: [],
    });
    expect(results.specs[0]?.limits).toEqual({ lower: 0.5, upper: 6 });
  });

  it("draws no spec line when extraction and override are both empty on that side", () => {
    const extraction = torqueExtraction();
    extraction.limits = { lower: null, upper: null };
    const { results } = scatterFromExtraction(extraction, {
      query: "M3-SYS-FN-037",
      existingTitles: [],
    });
    expect(results.specs[0]?.limits).toEqual({ lower: null, upper: null });
  });

  it("disambiguates the title when the query is already used", () => {
    const { config } = scatterFromExtraction(torqueExtraction(), {
      query: "M3-SYS-FN-037",
      existingTitles: ["M3-SYS-FN-037"],
    });
    expect(config.title).toBe("M3-SYS-FN-037 (2)");
  });

  it("returns the extraction error instead of inventing points", async () => {
    const result = await runMeasurementScatter({
      reportId: "report-1",
      query: "M3-SYS-FN-037",
      existingTitles: [],
      extract: async () => ({
        status: "not_found",
        message: "No cited measurements matched that query.",
      }),
    });
    expect(result).toEqual({
      ok: false,
      error: "No cited measurements matched that query.",
    });
  });

  it("saves the scatter when the extract callback verifies rows", async () => {
    const result = await runMeasurementScatter({
      reportId: "report-1",
      query: "M3-SYS-FN-037",
      existingTitles: [],
      extract: async () => torqueExtraction(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results.n).toBe(10);
    expect(result.config.query).toBe("M3-SYS-FN-037");
  });
});
