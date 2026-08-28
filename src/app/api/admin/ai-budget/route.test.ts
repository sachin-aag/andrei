import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/ai/usage", () => ({
  getAiBudgetSettings: vi.fn(),
  getAiBudgetStatus: vi.fn(),
  updateAiBudgetSettings: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditActorFromUser: vi.fn((user: { id: string; name: string; role: string }) => ({
    id: user.id,
    name: user.name,
    role: user.role,
  })),
  recordAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

import {
  getAiBudgetSettings,
  getAiBudgetStatus,
  updateAiBudgetSettings,
} from "@/lib/ai/usage";
import { getCurrentUser } from "@/lib/auth/session";
import { GET, PATCH } from "./route";

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

const status = {
  monthlyBudgetUsd: 500,
  enforceHardLimit: true,
  warningThresholdPercent: 80,
  currentMonthSpendUsd: 125.5,
  percentUsed: 25.1,
  isWarning: false,
  isOverBudget: false,
  yearMonth: "2026-08",
  cycleStart: "2026-08-01T00:00:00.000Z",
  cycleEnd: "2026-09-01T00:00:00.000Z",
  featureBreakdown: [],
};

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/admin/ai-budget", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/ai-budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAiBudgetStatus).mockResolvedValue(status);
    vi.mocked(getAiBudgetSettings).mockResolvedValue({
      monthlyBudgetUsd: 500,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    vi.mocked(updateAiBudgetSettings).mockResolvedValue({
      monthlyBudgetUsd: 750,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    });
  });

  it("rejects unauthenticated GET requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("rejects non-admin GET requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("returns budget status for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.monthlyBudgetUsd).toBe(500);
    expect(body.currentMonthSpendUsd).toBe(125.5);
  });

  it("updates budget settings for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(getAiBudgetStatus).mockResolvedValueOnce({
      ...status,
      monthlyBudgetUsd: 750,
    });

    const response = await PATCH(patchRequest({ monthlyBudgetUsd: 750 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateAiBudgetSettings).toHaveBeenCalledWith({ monthlyBudgetUsd: 750 });
    expect(body.monthlyBudgetUsd).toBe(750);
  });

  it("rejects empty PATCH payloads", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await PATCH(patchRequest({}));

    expect(response.status).toBe(400);
  });
});
