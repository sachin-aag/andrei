// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { computeBoxplot } from "@/lib/statistical-analysis/boxplot";
import {
  BOXPLOT,
  type BoxplotAnalysisSummary,
} from "@/lib/statistical-analysis/types";
import {
  createEmptyWorksheet,
  pasteTsv,
  renameColumn,
} from "@/lib/statistical-analysis/worksheet";
import { BoxplotView } from "./boxplot-view";

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

function nestedWorksheet() {
  let sheet = createEmptyWorksheet(3);
  sheet = renameColumn(sheet, 0, "Assay");
  sheet = renameColumn(sheet, 1, "Operator");
  sheet = renameColumn(sheet, 2, "Batch");
  sheet = pasteTsv(sheet, 0, 0, ["10", "12", "20", "22"].join("\n"));
  sheet = pasteTsv(sheet, 1, 0, ["OP1", "OP2", "OP1", "OP2"].join("\n"));
  sheet = pasteTsv(sheet, 2, 0, ["A123", "A123", "A124", "A124"].join("\n"));
  return sheet;
}

function summaryFromConfig(
  config: BoxplotAnalysisSummary["config"]
): BoxplotAnalysisSummary {
  const outcome = computeBoxplot(nestedWorksheet(), config);
  if (!outcome.ok) throw new Error(outcome.message);
  return {
    id: "an-box",
    workspaceId: "ws-1",
    kind: BOXPLOT,
    title: config.title,
    config,
    results: outcome.result,
    sourceHash: "box",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
    previewImage: null,
  };
}

describe("BoxplotView", () => {
  it("draws one box when there are no categories", () => {
    const analysis = summaryFromConfig({
      yColumnId: "c1",
      yColumnName: "Assay",
      categoryColumnIds: [],
      categoryColumnNames: [],
      title: "Boxplot of Assay",
    });
    render(<BoxplotView analysis={analysis} {...viewProps} />);

    expect(screen.getByTestId("boxplot")).toBeInTheDocument();
    expect(screen.getByTestId("boxplot-chart")).toBeInTheDocument();
    expect(screen.getByTestId("boxplot-group-0")).toBeInTheDocument();
    expect(screen.queryByTestId("boxplot-axis-level-0")).toBeNull();
    expect(
      screen.getByRole("heading", { name: /Boxplot of Assay$/ })
    ).toBeTruthy();
  });

  it("nests category labels on the x-axis innermost-first", () => {
    const analysis = summaryFromConfig({
      yColumnId: "c1",
      yColumnName: "Assay",
      categoryColumnIds: ["c2", "c3"],
      categoryColumnNames: ["Operator", "Batch"],
      title: "Boxplot of Assay by Operator, Batch",
    });
    render(<BoxplotView analysis={analysis} {...viewProps} />);

    expect(screen.getByTestId("boxplot-axis-level-0")).toBeInTheDocument();
    expect(screen.getByTestId("boxplot-axis-level-1")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Boxplot of Assay by Operator, Batch/ })
    ).toBeTruthy();
    expect(screen.getByText("A123")).toBeTruthy();
    expect(screen.getByText("A124")).toBeTruthy();
    expect(screen.getAllByText("OP1").length).toBeGreaterThan(0);
  });

  it("renders custom axis titles", () => {
    const analysis = summaryFromConfig({
      yColumnId: "c1",
      yColumnName: "Assay",
      categoryColumnIds: ["c2"],
      categoryColumnNames: ["Operator"],
      title: "Boxplot of Assay by Operator",
      xAxisLabel: "Operator ID",
      yAxisLabel: "Assay (%)",
    });
    render(<BoxplotView analysis={analysis} {...viewProps} />);

    expect(screen.getByTestId("boxplot-x-axis-title")).toHaveTextContent(
      "Operator ID"
    );
    expect(screen.getByTestId("boxplot-chart")).toHaveTextContent("Assay (%)");
  });
});
