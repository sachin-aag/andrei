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
  it("offers Switch to Agent in Document chrome, not Analytics", async () => {
    const user = userEvent.setup();
    const onChromeChange = vi.fn();
    render(
      <ReportWorkspaceHeader {...baseProps} onChromeChange={onChromeChange} />
    );
    const switchBtn = screen.getByRole("button", { name: "Switch to Agent" });
    expect(switchBtn).toHaveAttribute("data-current-chrome", "document");
    expect(switchBtn).toHaveAttribute("data-testid", "report-chrome-switch");
    expect(
      screen.queryByRole("button", { name: "Switch to Document" })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-surface-analytics")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Analytics" })).not.toBeInTheDocument();
    await user.click(switchBtn);
    expect(onChromeChange).toHaveBeenCalledWith("agent");
  });

  it("offers Switch to Document in Agent chrome", async () => {
    const user = userEvent.setup();
    const onChromeChange = vi.fn();
    render(
      <ReportWorkspaceHeader
        {...baseProps}
        chrome="agent"
        onChromeChange={onChromeChange}
      />
    );
    const switchBtn = screen.getByRole("button", { name: "Switch to Document" });
    expect(switchBtn).toHaveAttribute("data-current-chrome", "agent");
    await user.click(switchBtn);
    expect(onChromeChange).toHaveBeenCalledWith("document");
  });

  it("shows Run all in Agent chrome and hides it on Analytics", () => {
    const { rerender } = render(
      <ReportWorkspaceHeader {...baseProps} chrome="agent" />
    );
    expect(screen.getByTestId("run-all-evaluation")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-suggestion-actions")).not.toBeInTheDocument();

    rerender(
      <ReportWorkspaceHeader
        {...baseProps}
        chrome="agent"
        workProductView="analytics"
      />
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
    expect(screen.getByTestId("bulk-suggestion-actions")).toBeInTheDocument();
  });
});
