// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentWorkProductRail } from "./agent-work-product-rail";

describe("AgentWorkProductRail", () => {
  it("shows expand plus only the last active work-product icon", async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    const onSelectView = vi.fn();
    render(
      <AgentWorkProductRail
        workProductView="analytics"
        statsEnabled
        onSelectView={onSelectView}
        onExpand={onExpand}
      />
    );

    expect(
      screen.getByRole("button", { name: /expand document panel/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Analytics" }));
    expect(onSelectView).toHaveBeenCalledWith("analytics");
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
