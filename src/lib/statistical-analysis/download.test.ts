import { describe, expect, it } from "vitest";
import { CAPABILITY_SIXPACK_NORMAL, MEASUREMENT_SCATTER, ONE_WAY_ANOVA } from "./types";
import type { StatisticalAnalysisSummary } from "./types";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import { computeOneWayAnova } from "./anova";
import { createEmptyWorksheet, pasteTsv } from "./worksheet";
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

  it("downloads measurement scatter points and citations", () => {
    const analysis: StatisticalAnalysisSummary = {
      id: "an-scatter",
      workspaceId: "ws-1",
      kind: MEASUREMENT_SCATTER,
      title: "Tip Detachment Torque",
      config: {
        query: "M3-SYS-FN-037",
        title: "Tip Detachment Torque",
        xLabel: "Measurement",
        yLabel: "Torque (ozf-in)",
        layout: TORQUE_MOCK_SPEC.layout,
        lsl: null,
        usl: null,
      },
      results: {
        specs: [TORQUE_MOCK_SPEC],
        n: TORQUE_MOCK_SPEC.points.length,
        uom: "ozf-in",
      },
      sourceHash: "def",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
    };
    expect(analysisDownloadFilename(analysis)).toBe(
      "Tip-Detachment-Torque-measurement-scatter.csv"
    );
    const csv = analysisToCsv(analysis);
    expect(csv).toContain("Measurement scatter");
    expect(csv).toContain("M3-SYS-FN-037");
    expect(csv).toContain("Chart,Series,Label,X,Y,UOM");
    expect(csv).toContain("Tip 1");
    expect(csv).toContain(String(TORQUE_MOCK_SPEC.points[0]?.y));
  });

  it("downloads the ANOVA table, group means, and Bonferroni pairwise rows", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = pasteTsv(sheet, 0, 0, ["1", "2", "3", "4", "5", "6"].join("\n"));
    sheet = pasteTsv(sheet, 1, 0, ["A", "A", "A", "B", "B", "B"].join("\n"));
    const outcome = computeOneWayAnova(sheet, {
      responseColumnId: "c1",
      responseColumnName: "Y",
      factorColumnId: "c2",
      factorColumnName: "Group",
      title: "Y by Group",
    });
    if (!outcome.ok) throw new Error(outcome.message);
    const analysis: StatisticalAnalysisSummary = {
      id: "an-anova",
      workspaceId: "ws-1",
      kind: ONE_WAY_ANOVA,
      title: "Y by Group",
      config: {
        responseColumnId: "c1",
        responseColumnName: "Y",
        factorColumnId: "c2",
        factorColumnName: "Group",
        title: "Y by Group",
        alpha: 0.05,
      },
      results: outcome.result,
      sourceHash: "anova",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
    };
    expect(analysisDownloadFilename(analysis)).toBe("Y-by-Group-one-way-anova.csv");
    const csv = analysisToCsv(analysis);
    expect(csv).toContain("One-way ANOVA");
    expect(csv).toContain("Source,DF,SS,MS,F,P");
    expect(csv).toContain("Pairwise (Bonferroni t-tests using ANOVA MSE)");
    expect(csv).toContain("A - B");
  });
});
