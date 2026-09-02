// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { computeHistogramFromValues } from "@/lib/statistical-analysis/histogram";
import { HISTOGRAM } from "@/lib/statistical-analysis/types";
import type { HistogramAnalysisSummary } from "@/lib/statistical-analysis/types";
import { HistogramView } from "./histogram-view";

vi.mock("@/hooks/use-analysis-preview-capture", () => ({
  useAnalysisPreviewCapture: () => {},
}));

const viewProps = {
  reportId: "report-1",
  onPreviewUploaded: () => {},
  onEdit: () => {},
  onRecompute: () => {},
  onDelete: () => {},
  recomputing: false,
};

function summaryFromValues(
  values: number[],
  lsl: number | null,
  usl: number | null
): HistogramAnalysisSummary {
  const outcome = computeHistogramFromValues(values, 0, {
    columnId: "c1",
    columnName: "Measurement",
    title: "Histogram of Measurement",
    lsl,
    usl,
  });
  if (!outcome.ok) {
    throw new Error(outcome.message);
  }
  return {
    id: "an-hist",
    workspaceId: "ws-1",
    kind: HISTOGRAM,
    title: "Histogram of Measurement",
    config: {
      columnId: "c1",
      columnName: "Measurement",
      title: "Histogram of Measurement",
      lsl,
      usl,
    },
    results: outcome.result,
    sourceHash: "abc",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
    previewImage: null,
  };
}

describe("HistogramView axes", () => {
  it("shows a full measurement scale instead of only the two endpoints", () => {
    const analysis = summaryFromValues(
      [10, 12, 11, 13, 14, 12, 11, 9, 15, 70],
      14,
      null
    );

    render(
      <HistogramView
        analysis={analysis}
        {...viewProps}
      />
    );

    const xTicks = screen.getAllByTestId("histogram-x-tick").map((node) =>
      node.textContent
    );
    const yTicks = screen.getAllByTestId("histogram-y-tick").map((node) =>
      node.textContent
    );
    expect(xTicks.length).toBeGreaterThan(2);
    expect(yTicks.length).toBeGreaterThan(2);
    expect(xTicks).toEqual(["-50", "0", "50", "100"]);
    expect(xTicks).not.toContain("-14.52");
    expect(yTicks).toContain("0");
  });
});
