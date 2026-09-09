import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/usage/activity", () => ({
  getUserActivityReport: vi.fn(),
}));

import { getUserActivityReport } from "@/lib/usage/activity";
import { getCurrentUser } from "@/lib/auth/session";
import { GET } from "./route";

const admin = {
  id: "admin-1",
  name: "Admin",
  email: "admin@mjbiopharm.com",
  role: "admin" as const,
  title: "Admin",
};

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@mjbiopharm.com",
  role: "engineer" as const,
  title: "Engineer",
};

const report = {
  instanceId: "mj" as const,
  instanceLabel: "MJ",
  productName: "M.J. Biopharm",
  today: "2026-09-09",
  yearMonth: "2026-09",
  weekStart: "2026-09-07T00:00:00.000Z",
  weekEnd: "2026-09-14T00:00:00.000Z",
  cycleStart: "2026-09-01T00:00:00.000Z",
  cycleEnd: "2026-10-01T00:00:00.000Z",
  dailyActiveUsers: 2,
  weeklyActiveUsers: 4,
  monthlyActiveUsers: 6,
  weekTotalSeconds: 90,
  monthTotalSeconds: 180,
  users: [],
};

describe("/api/admin/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserActivityReport).mockResolvedValue(report);
  });

  it("returns activity for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(report);
  });

  it("forbids non-admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer as never);
    const response = await GET();
    expect(response.status).toBe(403);
  });
});
