import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { POST } from "@/app/api/reports/[reportId]/submit/route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const report = {
  id: "report-1",
  authorId: engineer.id,
  status: "draft",
};

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockUpdateReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValueOnce(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValueOnce({ set } as never);
}

describe("POST /api/reports/[reportId]/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/submit"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 404 when report is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockSelectOnce([]);

    const response = await POST(new Request("http://localhost/submit"), {
      params: Promise.resolve({ reportId: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 403 when caller is not the author", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockSelectOnce([{ ...report, authorId: "other-user" }]);

    const response = await POST(new Request("http://localhost/submit"), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(403);
  });

  it("submits draft report", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockSelectOnce([report]);
    mockUpdateReturning([{ ...report, status: "submitted" }]);

    const response = await POST(new Request("http://localhost/submit"), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      report: { ...report, status: "submitted" },
    });
  });
});
