// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import {
  MEASUREMENT_SCATTER,
  XY_SCATTER,
  type ScatterAnalysisSummary,
  type XyScatterAnalysisSummary,
} from "@/lib/statistical-analysis/types";
import { ScatterView } from "./scatter-view";

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

function scatterSummary(
  limits: { lower: number | null; upper: number | null }
): ScatterAnalysisSummary {
  const spec = { ...TORQUE_MOCK_SPEC, limits };
  return {
    id: "an-scatter",
    workspaceId: "ws-1",
    kind: MEASUREMENT_SCATTER,
    title: spec.title,
    config: {
      query: spec.query,
      title: spec.title,
      xLabel: spec.xLabel,
      yLabel: spec.yLabel,
      layout: spec.layout,
      lsl: limits.lower,
      usl: limits.upper,
    },
    results: {
      specs: [spec],
      n: spec.points.length,
      uom: spec.uom,
    },
    sourceHash: "def",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
    previewImage: null,
  };
}

describe("ScatterView spec limits", () => {
  it("draws labeled LSL and USL lines when both limits are present", () => {
    render(
      <ScatterView
        analysis={scatterSummary({ lower: 1, upper: 6 })}
        {...viewProps}
      />
    );

    expect(screen.getByTestId("scatter-spec-line-lsl")).toBeTruthy();
    expect(screen.getByTestId("scatter-spec-line-usl")).toBeTruthy();
    expect(screen.getByTestId("scatter-spec-label-lsl")).toHaveTextContent("1.00");
    expect(screen.getByTestId("scatter-spec-label-usl")).toHaveTextContent("6.00");
    expect(screen.getByTestId("scatter-spec-label-lsl")).toHaveAttribute(
      "aria-label",
      "LSL 1.00"
    );
  });

  it("omits spec lines when neither limit is set", () => {
    render(
      <ScatterView
        analysis={scatterSummary({ lower: null, upper: null })}
        {...viewProps}
      />
    );

    expect(screen.queryByTestId("scatter-spec-line-lsl")).toBeNull();
    expect(screen.queryByTestId("scatter-spec-line-usl")).toBeNull();
    expect(screen.queryByTestId("scatter-spec-label-lsl")).toBeNull();
    expect(screen.queryByTestId("scatter-spec-label-usl")).toBeNull();
  });

  it("draws a one-sided USL without inventing LSL", () => {
    render(
      <ScatterView
        analysis={scatterSummary({ lower: null, upper: 6 })}
        {...viewProps}
      />
    );

    expect(screen.queryByTestId("scatter-spec-line-lsl")).toBeNull();
    expect(screen.getByTestId("scatter-spec-line-usl")).toBeTruthy();
    expect(screen.getByTestId("scatter-spec-label-usl")).toHaveTextContent("6.00");
  });

  it("renders a line chart instead of dots when mark is line", () => {
    const spec = {
      ...TORQUE_MOCK_SPEC,
      layout: { ...TORQUE_MOCK_SPEC.layout, mark: "line" as const },
    };
    render(
      <ScatterView
        analysis={{
          ...scatterSummary({ lower: null, upper: null }),
          results: { specs: [spec], n: spec.points.length, uom: spec.uom },
        }}
        {...viewProps}
      />
    );
    const chart = screen.getByTestId("measurement-scatter-chart");
    expect(chart.getAttribute("data-chart-mark")).toBe("line");
    expect(chart.querySelectorAll("circle")).toHaveLength(0);
    expect(chart.querySelectorAll("polyline").length).toBeGreaterThan(1);
  });

  it("shows attachment page citations on a worksheet plot subtitle", () => {
    const spec = {
      ...TORQUE_MOCK_SPEC,
      query: "Assay vs Observation",
      title: "Assay vs Observation",
      xLabel: "Observation",
      yLabel: "Assay",
      uom: "",
      citations: [{ attachmentId: "att_1", page: 31 }],
    };
    const analysis: XyScatterAnalysisSummary = {
      id: "an-xy",
      workspaceId: "ws-1",
      kind: XY_SCATTER,
      title: spec.title,
      config: {
        xColumnId: null,
        xColumnName: "Observation",
        yColumnId: "c1",
        yColumnName: "Assay",
        title: spec.title,
      },
      results: {
        specs: [spec],
        n: spec.points.length,
        skipped: 0,
        pearsonR: null,
      },
      sourceHash: "xy",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    render(<ScatterView analysis={analysis} {...viewProps} />);
    expect(screen.getByText(/p\. 31/)).toBeTruthy();
  });
});
