// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkProductTabs } from "./work-product-tabs";

describe("WorkProductTabs", () => {
  it("keeps existing surface test ids and labels Report not Document", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WorkProductTabs value="report" onChange={onChange} />);
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
});
