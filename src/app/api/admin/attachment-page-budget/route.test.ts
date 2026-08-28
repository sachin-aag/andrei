import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/attachments/page-budget", () => ({
  getAttachmentPageBudgetSettings: vi.fn(),
  getAttachmentPageBudgetStatus: vi.fn(),
  updateAttachmentPageBudgetSettings: vi.fn(),
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
  getAttachmentPageBudgetSettings,
  getAttachmentPageBudgetStatus,
  updateAttachmentPageBudgetSettings,
} from "@/lib/attachments/page-budget";
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
  monthlyPageLimit: 100_000,
  enforceHardLimit: true,
  warningThresholdPercent: 80,
  currentMonthPageCount: 12_500,
  inFlightPageCount: 250,
  totalCommittedPageCount: 12_750,
  percentUsed: 12.8,
  isWarning: false,
  isOverBudget: false,
  yearMonth: "2026-08",
  cycleStart: "2026-08-01T00:00:00.000Z",
  cycleEnd: "2026-09-01T00:00:00.000Z",
  eventCount: 42,
};

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/admin/attachment-page-budget", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/attachment-page-budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAttachmentPageBudgetStatus).mockResolvedValue(status);
    vi.mocked(getAttachmentPageBudgetSettings).mockResolvedValue({
      monthlyPageLimit: 100_000,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    vi.mocked(updateAttachmentPageBudgetSettings).mockResolvedValue({
      monthlyPageLimit: 150_000,
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

  it("returns page budget status for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.monthlyPageLimit).toBe(100_000);
    expect(body.totalCommittedPageCount).toBe(12_750);
  });

  it("updates page budget settings for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(getAttachmentPageBudgetStatus).mockResolvedValueOnce({
      ...status,
      monthlyPageLimit: 150_000,
    });

    const response = await PATCH(patchRequest({ monthlyPageLimit: 150_000 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateAttachmentPageBudgetSettings).toHaveBeenCalledWith({
      monthlyPageLimit: 150_000,
    });
    expect(body.monthlyPageLimit).toBe(150_000);
  });

  it("rejects empty PATCH payloads", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await PATCH(patchRequest({}));

    expect(response.status).toBe(400);
  });
});
