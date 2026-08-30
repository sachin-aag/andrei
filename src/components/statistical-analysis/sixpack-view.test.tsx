// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatLimit } from "@/lib/statistical-analysis/format";
import { SAMPLE_ASSAY_VALUES } from "@/lib/statistical-analysis/sample-data";
import { computeCapabilitySixpackFromValues } from "@/lib/statistical-analysis/sixpack";
import {
  CAPABILITY_SIXPACK_NORMAL,
  type SixpackAnalysisSummary,
} from "@/lib/statistical-analysis/types";
import { SixpackView } from "./sixpack-view";

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
  config: SixpackAnalysisSummary["config"]
): SixpackAnalysisSummary {
  const outcome = computeCapabilitySixpackFromValues(values, 0, config);
  if (!outcome.ok) {
    throw new Error(outcome.message);
  }
  return {
    id: "an-six",
    workspaceId: "ws-1",
    kind: CAPABILITY_SIXPACK_NORMAL,
    title: config.title,
    config,
    results: outcome.result,
    sourceHash: "abc",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
    previewImage: null,
  };
}

const assayConfig = {
  columnId: "c1",
  columnName: "Assay",
  title: "Assay",
  lsl: 90,
  usl: 110,
  target: 100,
} as const;

describe("SixpackView limit labels", () => {
  it("labels spec-limit values on the capability histogram without LSL/USL prefixes", () => {
    const analysis = summaryFromValues([...SAMPLE_ASSAY_VALUES], assayConfig);

    render(
      <SixpackView
        analysis={analysis}
        {...viewProps}
      />
    );

    expect(screen.getByTestId("sixpack-spec-label-lsl")).toHaveTextContent(
      "90.00"
    );
    expect(screen.getByTestId("sixpack-spec-label-usl")).toHaveTextContent(
      "110.00"
    );
    expect(screen.getByTestId("sixpack-spec-label-lsl")).toHaveAttribute(
      "aria-label",
      "LSL 90.00"
    );
  });

  it("labels a one-sided spec without inventing the missing limit", () => {
    const analysis = summaryFromValues([...SAMPLE_ASSAY_VALUES], {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay",
      lsl: 90,
      usl: null,
      target: null,
    });

    render(
      <SixpackView
        analysis={analysis}
        {...viewProps}
      />
    );

    expect(screen.getByTestId("sixpack-spec-label-lsl")).toHaveTextContent(
      "90.00"
    );
    expect(screen.queryByTestId("sixpack-spec-label-usl")).toBeNull();
    expect(screen.getByTestId("sixpack-ichart-label-lsl")).toHaveTextContent(
      "90.00"
    );
    expect(screen.queryByTestId("sixpack-ichart-label-usl")).toBeNull();
    expect(screen.getByTestId("sixpack-last25-label-lsl")).toHaveTextContent(
      "90.00"
    );
    expect(screen.queryByTestId("sixpack-last25-label-usl")).toBeNull();
  });

  it("labels UCL and LCL on the I chart and moving range", () => {
    const analysis = summaryFromValues([...SAMPLE_ASSAY_VALUES], assayConfig);
    const ucl = formatLimit(analysis.results.individuals.ucl);
    const lcl = formatLimit(analysis.results.individuals.lcl);
    const mrUcl = formatLimit(analysis.results.movingRange.ucl);
    const mrLcl = formatLimit(analysis.results.movingRange.lcl);

    render(
      <SixpackView
        analysis={analysis}
        {...viewProps}
      />
    );

    expect(screen.getByTestId("sixpack-ichart-label-ucl")).toHaveTextContent(
      ucl
    );
    expect(screen.getByTestId("sixpack-ichart-label-lcl")).toHaveTextContent(
      lcl
    );
    expect(screen.queryByTestId("sixpack-last25-label-ucl")).toBeNull();
    expect(screen.queryByTestId("sixpack-last25-label-lcl")).toBeNull();
    expect(screen.getByTestId("sixpack-mr-label-ucl")).toHaveTextContent(mrUcl);
    expect(screen.getByTestId("sixpack-mr-label-lcl")).toHaveTextContent(mrLcl);
  });

  it("draws the histogram LSL/USL on the I chart and last 25 observations", () => {
    const analysis = summaryFromValues([...SAMPLE_ASSAY_VALUES], assayConfig);
    const ucl = formatLimit(analysis.results.individuals.ucl);

    render(
      <SixpackView
        analysis={analysis}
        {...viewProps}
      />
    );

    expect(screen.getByTestId("sixpack-ichart-label-lsl")).toHaveTextContent(
      "90.00"
    );
    expect(screen.getByTestId("sixpack-ichart-label-usl")).toHaveTextContent(
      "110.00"
    );
    expect(screen.getByTestId("sixpack-last25-label-lsl")).toHaveTextContent(
      "90.00"
    );
    expect(screen.getByTestId("sixpack-last25-label-usl")).toHaveTextContent(
      "110.00"
    );
    expect(screen.getByTestId("sixpack-spec-label-lsl")).toHaveTextContent(
      "90.00"
    );
    expect(screen.getByTestId("sixpack-spec-label-usl")).toHaveTextContent(
      "110.00"
    );
    expect(screen.getByTestId("sixpack-ichart-label-ucl")).toHaveTextContent(
      ucl
    );
    expect(screen.getByTestId("sixpack-ichart-label-ucl")).not.toHaveTextContent(
      "110.00"
    );
    expect(screen.queryByTestId("sixpack-mr-label-lsl")).toBeNull();
    expect(screen.queryByTestId("sixpack-mr-label-usl")).toBeNull();
  });

  it("keeps process-capability stats on one line at three decimal places", () => {
    const analysis = summaryFromValues([...SAMPLE_ASSAY_VALUES], assayConfig);

    render(
      <SixpackView
        analysis={analysis}
        {...viewProps}
      />
    );

    const overall = screen.getByTestId("sixpack-stdev-overall");
    const within = screen.getByTestId("sixpack-stdev-within");
    expect(overall).toHaveTextContent(
      analysis.results.overallStdev.toFixed(3)
    );
    expect(within).toHaveTextContent(analysis.results.withinStdev.toFixed(3));
    expect(overall.textContent?.includes("\n")).toBe(false);
    expect(overall).toHaveClass("whitespace-nowrap");
    expect(within).toHaveClass("whitespace-nowrap");
    expect(screen.getByTestId("sixpack-mean")).toHaveTextContent(
      analysis.results.mean.toFixed(3)
    );
  });
});
