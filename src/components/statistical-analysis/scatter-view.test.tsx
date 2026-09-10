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

  it("hides LSL/USL on a worksheet plot until showSpecLimits is on", () => {
    const spec = {
      ...TORQUE_MOCK_SPEC,
      limits: { lower: 1, upper: 6 },
      layout: { ...TORQUE_MOCK_SPEC.layout, showSpecLimits: false },
    };
    const analysis: XyScatterAnalysisSummary = {
      id: "an-xy-limits",
      workspaceId: "ws-1",
      kind: XY_SCATTER,
      title: spec.title,
      config: {
        xColumnId: null,
        xColumnName: "Observation",
        yColumnId: "c1",
        yColumnName: "Assay",
        title: spec.title,
        showSpecLimits: false,
      },
      results: {
        specs: [spec],
        n: spec.points.length,
        skipped: 0,
        pearsonR: null,
      },
      sourceHash: "xy-limits",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const { rerender } = render(
      <ScatterView analysis={analysis} {...viewProps} />
    );
    expect(screen.queryByTestId("scatter-spec-line-lsl")).toBeNull();
    expect(screen.queryByTestId("scatter-spec-line-usl")).toBeNull();

    rerender(
      <ScatterView
        analysis={{
          ...analysis,
          config: { ...analysis.config, showSpecLimits: true },
          results: {
            ...analysis.results,
            specs: [
              {
                ...spec,
                layout: { ...spec.layout, showSpecLimits: true },
              },
            ],
          },
        }}
        {...viewProps}
      />
    );
    expect(screen.getByTestId("scatter-spec-line-lsl")).toBeTruthy();
    expect(screen.getByTestId("scatter-spec-line-usl")).toBeTruthy();
  });

  it("hides the mean line until showMeanLine is on", () => {
    const spec = {
      ...TORQUE_MOCK_SPEC,
      layout: { ...TORQUE_MOCK_SPEC.layout, showMeanLine: false },
    };
    const analysis: XyScatterAnalysisSummary = {
      id: "an-xy-mean",
      workspaceId: "ws-1",
      kind: XY_SCATTER,
      title: spec.title,
      config: {
        xColumnId: null,
        xColumnName: "Observation",
        yColumnId: "c1",
        yColumnName: "Assay",
        title: spec.title,
        showMeanLine: false,
      },
      results: {
        specs: [spec],
        n: spec.points.length,
        skipped: 0,
        pearsonR: null,
      },
      sourceHash: "xy-mean",
      stale: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      previewImage: null,
    };
    const { rerender } = render(
      <ScatterView analysis={analysis} {...viewProps} />
    );
    expect(screen.queryByTestId("scatter-mean-line")).toBeNull();
    expect(screen.queryByTestId("scatter-mean-marker")).toBeNull();

    rerender(
      <ScatterView
        analysis={{
          ...analysis,
          config: { ...analysis.config, showMeanLine: true },
          results: {
            ...analysis.results,
            specs: [
              {
                ...spec,
                layout: { ...spec.layout, showMeanLine: true },
              },
            ],
          },
        }}
        {...viewProps}
      />
    );
    expect(screen.getByTestId("scatter-mean-line")).toBeTruthy();
    expect(screen.getAllByTestId("scatter-mean-marker")).toHaveLength(
      spec.points.length
    );
  });

  it("omits attachment page citations from a worksheet plot subtitle", () => {
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
    expect(screen.getByTestId("analysis-preview-figure").textContent).not.toMatch(
      /p\.\s*31/
    );
    expect(
      screen.getByText(/Assay vs Observation · \d+ points/)
    ).toBeTruthy();
  });

  it("omits attachment page citations from a measurement scatter subtitle", () => {
    const analysis = scatterSummary({ lower: 1, upper: 6 });
    analysis.results.specs[0] = {
      ...analysis.results.specs[0]!,
      citations: [{ attachmentId: "att_1", page: 13 }],
    };
    render(<ScatterView analysis={analysis} {...viewProps} />);
    const figure = screen.getByTestId("analysis-preview-figure");
    expect(figure.textContent).not.toMatch(/p\.\s*13/);
    expect(figure.textContent).not.toContain("no citations");
  });
});
