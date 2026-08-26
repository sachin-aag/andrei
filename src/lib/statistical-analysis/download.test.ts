import { describe, expect, it } from "vitest";
import { CAPABILITY_SIXPACK_NORMAL } from "./types";
import type { StatisticalAnalysisSummary } from "./types";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import {
  analysisDownloadFilename,
  analysisToCsv,
} from "./download";

function sampleAnalysis(): StatisticalAnalysisSummary {
  const outcome = computeCapabilitySixpackFromValues(
    [10, 12, 11, 13, 14],
    0,
    {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay (rows 1–5)",
      lsl: 8,
      usl: 16,
      target: 12,
      rowStart: 1,
      rowEnd: 5,
    }
  );
  if (!outcome.ok) throw new Error(outcome.message);
  return {
    id: "an-1",
    workspaceId: "ws-1",
    kind: CAPABILITY_SIXPACK_NORMAL,
    title: "Assay (rows 1–5)",
    config: {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay (rows 1–5)",
      lsl: 8,
      usl: 16,
      target: 12,
      rowStart: 1,
      rowEnd: 5,
    },
    results: outcome.result,
    sourceHash: "abc",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

describe("analysis download", () => {
  it("builds a safe csv filename from the title", () => {
    const analysis = sampleAnalysis();
    expect(analysisDownloadFilename(analysis)).toBe(
      "Assay-rows-1-5-capability-sixpack.csv"
    );
    expect(
      analysisDownloadFilename({ ...analysis, title: "  " })
    ).toBe("sixpack-capability-sixpack.csv");
  });

  it("includes specs, capability, and the observation series", () => {
    const csv = analysisToCsv(sampleAnalysis());
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Assay (rows 1–5)");
    expect(csv).toContain("rows 1–5");
    expect(csv).toContain("Sample N,5");
    expect(csv).toContain("Cpk,");
    expect(csv).toContain("Index,Value");
    expect(csv).toContain("1,10.0000");
    expect(csv).toContain("5,14.0000");
  });
});
