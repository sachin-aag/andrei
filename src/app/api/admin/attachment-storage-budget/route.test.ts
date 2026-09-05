import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/attachments/storage-budget", () => ({
  BYTES_PER_GIB: 1024 * 1024 * 1024,
  getAttachmentStorageBudgetSettings: vi.fn(),
  getAttachmentStorageBudgetStatus: vi.fn(),
  updateAttachmentStorageBudgetSettings: vi.fn(),
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
  getAttachmentStorageBudgetSettings,
  getAttachmentStorageBudgetStatus,
  updateAttachmentStorageBudgetSettings,
} from "@/lib/attachments/storage-budget";
import { getCurrentUser } from "@/lib/auth/session";
import { GET, PATCH } from "./route";

const GIB = 1024 * 1024 * 1024;

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
  byteLimit: 100 * GIB,
  limitGb: 100,
  enforceHardLimit: true,
  warningThresholdPercent: 80,
  usedBytes: 12.5 * GIB,
  usedGb: 12.5,
  percentUsed: 12.5,
  isWarning: false,
  isOverBudget: false,
};

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/admin/attachment-storage-budget", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/attachment-storage-budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAttachmentStorageBudgetStatus).mockResolvedValue(status);
    vi.mocked(getAttachmentStorageBudgetSettings).mockResolvedValue({
      byteLimit: 100 * GIB,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    vi.mocked(updateAttachmentStorageBudgetSettings).mockResolvedValue({
      byteLimit: 150 * GIB,
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

  it("returns storage budget status for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.limitGb).toBe(100);
    expect(body.usedGb).toBe(12.5);
  });

  it("updates the cap from a GB value", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    vi.mocked(getAttachmentStorageBudgetStatus).mockResolvedValueOnce({
      ...status,
      byteLimit: 150 * GIB,
      limitGb: 150,
    });

    const response = await PATCH(patchRequest({ limitGb: 150 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateAttachmentStorageBudgetSettings).toHaveBeenCalledWith({
      byteLimit: 150 * GIB,
    });
    expect(body.limitGb).toBe(150);
  });

  it("rejects empty PATCH payloads", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await PATCH(patchRequest({}));

    expect(response.status).toBe(400);
  });
});
