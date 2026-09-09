// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminUsagePanel } from "./admin-usage-panel";
import type { UserActivityReport } from "@/lib/usage/activity-format";

const report: UserActivityReport = {
  instanceId: "convergent",
  instanceLabel: "Convergent",
  productName: "Convergent Dental",
  today: "2026-09-09",
  yearMonth: "2026-09",
  weekStart: "2026-09-07T00:00:00.000Z",
  weekEnd: "2026-09-14T00:00:00.000Z",
  cycleStart: "2026-09-01T00:00:00.000Z",
  cycleEnd: "2026-10-01T00:00:00.000Z",
  dailyActiveUsers: 3,
  weeklyActiveUsers: 5,
  monthlyActiveUsers: 8,
  weekTotalSeconds: 3_600,
  monthTotalSeconds: 7_200,
  users: [
    {
      userId: "u-1",
      name: "Sam Engineer",
      email: "sam@convergentdental.com",
      role: "engineer",
      weekActiveSeconds: 3_600,
      monthActiveSeconds: 7_200,
    },
  ],
};

describe("AdminUsagePanel", () => {
  it("shows DAU/WAU/MAU and time in app, not spend", () => {
    render(<AdminUsagePanel initialReport={report} />);
    expect(screen.getByRole("heading", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByText(/Convergent app/)).toBeInTheDocument();
    expect(screen.getByText("Daily active users")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Weekly active users")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Monthly active users")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Sam Engineer")).toBeInTheDocument();
    expect(screen.getAllByText("1h").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2h").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
