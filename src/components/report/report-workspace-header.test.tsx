// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportWorkspaceHeader } from "./report-workspace-header";
import type { ReportRecord } from "@/types/report";

vi.mock("./report-actions-menu", () => ({
  ReportActionsMenu: () => null,
}));
vi.mock("./report-export-button", () => ({
  ReportExportButton: () => null,
}));
vi.mock("./report-bulk-suggestion-actions", () => ({
  ReportBulkSuggestionActions: () => (
    <button type="button" data-testid="bulk-suggestion-actions">
      Bulk
    </button>
  ),
}));
vi.mock("./section-status-pill", () => ({
  RunAllEvaluationButton: () => (
    <button type="button" data-testid="run-all-evaluation">
      Run all
    </button>
  ),
}));
vi.mock("./status-badge", () => ({
  StatusBadge: () => <span>draft</span>,
}));

const report = {
  id: "r1",
  documentNo: "DEV-1",
  documentType: "investigation_report",
  status: "draft",
} as ReportRecord;

const baseProps = {
  report,
  mode: "edit" as const,
  chrome: "document" as const,
  onChromeChange: vi.fn(),
  workProductView: "report" as const,
  canSubmit: false,
  canReview: false,
  submitting: false,
  approving: false,
  sendingFeedback: false,
  onSubmit: vi.fn(),
  onApprove: vi.fn(),
  onFeedback: vi.fn(),
};

describe("ReportWorkspaceHeader chrome", () => {
  it("shows Document and Agent, not Analytics", () => {
    render(<ReportWorkspaceHeader {...baseProps} />);
    expect(screen.getByTestId("report-chrome-document")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByTestId("report-chrome-agent")).toHaveAttribute(
      "aria-selected",
      "false"
    );
    expect(screen.queryByTestId("report-surface-analytics")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Analytics" })).not.toBeInTheDocument();
  });

  it("marks Agent selected without selecting a ghost Analytics tab", async () => {
    const user = userEvent.setup();
    const onChromeChange = vi.fn();
    render(
      <ReportWorkspaceHeader
        {...baseProps}
        chrome="agent"
        onChromeChange={onChromeChange}
      />
    );
    expect(screen.getByTestId("report-chrome-agent")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByTestId("report-chrome-document")).toHaveAttribute(
      "aria-selected",
      "false"
    );
    await user.click(screen.getByTestId("report-chrome-document"));
    expect(onChromeChange).toHaveBeenCalledWith("document");
  });

  it("hides Run all when chrome is Agent or work product is Analytics", () => {
    const { rerender } = render(
      <ReportWorkspaceHeader {...baseProps} chrome="agent" />
    );
    expect(screen.queryByTestId("run-all-evaluation")).not.toBeInTheDocument();

    rerender(
      <ReportWorkspaceHeader
        {...baseProps}
        chrome="document"
        workProductView="analytics"
      />
    );
    expect(screen.queryByTestId("run-all-evaluation")).not.toBeInTheDocument();

    rerender(
      <ReportWorkspaceHeader
        {...baseProps}
        chrome="document"
        workProductView="report"
      />
    );
    expect(screen.getByTestId("run-all-evaluation")).toBeInTheDocument();
  });
});
