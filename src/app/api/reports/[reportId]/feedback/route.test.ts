import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { POST } from "@/app/api/reports/[reportId]/feedback/route";

const manager = {
  id: "manager-1",
  name: "Manager",
  email: "manager@example.com",
  role: "manager" as const,
  title: "QA Manager",
};

function mockUpdateReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValueOnce(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValueOnce({ set } as never);
}

describe("POST /api/reports/[reportId]/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/feedback"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 for non-managers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "engineer-1",
      name: "Engineer",
      email: "engineer@example.com",
      role: "engineer",
      title: "Engineer",
    });

    const response = await POST(new Request("http://localhost/feedback"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("returns feedback status for managers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(manager);
    mockUpdateReturning([{ id: "report-1", status: "feedback" }]);

    const response = await POST(new Request("http://localhost/feedback"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      report: { id: "report-1", status: "feedback" },
    });
  });
});
