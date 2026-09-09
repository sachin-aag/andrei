// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminUsagePanel } from "./admin-usage-panel";
import type { UserSpendReport } from "@/lib/ai/usage";

const report: UserSpendReport = {
  instanceId: "convergent",
  instanceLabel: "Convergent",
  productName: "Convergent Dental",
  yearMonth: "2026-09",
  weekStart: "2026-09-07T00:00:00.000Z",
  weekEnd: "2026-09-14T00:00:00.000Z",
  cycleStart: "2026-09-01T00:00:00.000Z",
  cycleEnd: "2026-10-01T00:00:00.000Z",
  weekTotalUsd: 2.5,
  monthTotalUsd: 10,
  users: [
    {
      userId: "u-1",
      name: "Sam Engineer",
      email: "sam@convergentdental.com",
      role: "engineer",
      weekSpendUsd: 2.5,
      monthSpendUsd: 10,
    },
  ],
};

describe("AdminUsagePanel", () => {
  it("labels the current instance and lists week and month spend", () => {
    render(<AdminUsagePanel initialReport={report} />);
    expect(screen.getByRole("heading", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByText(/Convergent instance/)).toBeInTheDocument();
    expect(screen.getByText("Sam Engineer")).toBeInTheDocument();
    expect(screen.getAllByText("$2.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$10.00").length).toBeGreaterThan(0);
  });
});
