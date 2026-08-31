import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/voice/budget", () => ({
  getVoiceBudgetSettings: vi.fn(),
  getVoiceBudgetStatus: vi.fn(),
  updateVoiceBudgetSettings: vi.fn(),
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
  getVoiceBudgetSettings,
  getVoiceBudgetStatus,
  updateVoiceBudgetSettings,
} from "@/lib/voice/budget";
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
  monthlyMinuteLimit: 100_000,
  enforceHardLimit: true,
  warningThresholdPercent: 80,
  currentMonthAudioSeconds: 1_800,
  currentMonthMinutes: 30,
  percentUsed: 0.03,
  isWarning: false,
  isOverBudget: false,
  yearMonth: "2026-08",
  cycleStart: "2026-08-01T00:00:00.000Z",
  cycleEnd: "2026-09-01T00:00:00.000Z",
  eventCount: 12,
};

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/admin/voice-budget", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/voice-budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVoiceBudgetStatus).mockResolvedValue(status);
    vi.mocked(getVoiceBudgetSettings).mockResolvedValue({
      monthlyMinuteLimit: 100_000,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    vi.mocked(updateVoiceBudgetSettings).mockResolvedValue({
      monthlyMinuteLimit: 150_000,
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

  it("returns voice budget status for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.monthlyMinuteLimit).toBe(100_000);
    expect(body.currentMonthMinutes).toBe(30);
  });

  it("updates voice budget settings for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(getVoiceBudgetStatus).mockResolvedValueOnce({
      ...status,
      monthlyMinuteLimit: 150_000,
    });

    const response = await PATCH(patchRequest({ monthlyMinuteLimit: 150_000 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateVoiceBudgetSettings).toHaveBeenCalledWith({
      monthlyMinuteLimit: 150_000,
    });
    expect(body.monthlyMinuteLimit).toBe(150_000);
  });

  it("rejects empty PATCH payloads", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await PATCH(patchRequest({}));

    expect(response.status).toBe(400);
  });
});
