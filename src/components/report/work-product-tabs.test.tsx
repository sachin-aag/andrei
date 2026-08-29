// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildCanvasTabs } from "./work-product-canvas";
import { WorkProductTabs } from "./work-product-tabs";

const BASE_TABS = buildCanvasTabs({
  statsEnabled: true,
  openAttachmentIds: ["att-1"],
  attachmentLabels: { "att-1": "batch.pdf" },
  compare: { from: 1, to: 2 },
});

describe("WorkProductTabs", () => {
  it("keeps existing surface test ids and labels Report not Document", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WorkProductTabs
        tabs={BASE_TABS}
        value="report"
        onChange={onChange}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId("report-surface-document")).toHaveTextContent(
      "Report"
    );
    expect(screen.getByTestId("report-surface-analytics")).toHaveTextContent(
      "Analytics"
    );
    expect(screen.getByTestId("report-surface-document")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await user.click(screen.getByTestId("report-surface-analytics"));
    expect(onChange).toHaveBeenCalledWith("analytics");
  });

  it("does not offer close on pinned tabs, and closes extra tabs", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <WorkProductTabs
        tabs={BASE_TABS}
        value="attachment:att-1"
        onChange={vi.fn()}
        onClose={onClose}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Close Report" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close Analytics" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close batch.pdf" }));
    expect(onClose).toHaveBeenCalledWith("attachment:att-1");

    await user.click(screen.getByRole("button", { name: "Close compare" }));
    expect(onClose).toHaveBeenCalledWith("history");
  });
});
