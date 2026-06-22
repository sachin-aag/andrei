import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { GET } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const admin = {
  id: "admin-1",
  name: "Admin",
  email: "admin@mjbiopharm.com",
  role: "admin" as const,
  title: "Admin",
};

const otherEngineer = {
  id: "engineer-2",
  name: "Other",
  email: "other@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const report = {
  id: "report-1",
  authorId: engineer.id,
  assignedManagerId: null,
  status: "draft",
  deviationNo: "DEV-001",
};

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockBundleSelects() {
  mockSelectOnce([report]);
  mockSelectOnce([]);
  mockSelectOnce([]);
  mockSelectOnce([]);
}

describe("GET /api/reports/[reportId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/reports/report-1"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 404 when report is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    mockSelectOnce([]);

    const response = await GET(new Request("http://localhost/api/reports/missing"), {
      params: Promise.resolve({ reportId: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  it("allows admins to fetch any report bundle", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    mockBundleSelects();

    const response = await GET(new Request("http://localhost/api/reports/report-1"), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.id).toBe(report.id);
  });

  it("allows authors to fetch their own report bundle", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockBundleSelects();

    const response = await GET(new Request("http://localhost/api/reports/report-1"), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(200);
  });

  it("returns 403 when engineer tries to view another author's report", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(otherEngineer);
    mockSelectOnce([report]);

    const response = await GET(new Request("http://localhost/api/reports/report-1"), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(403);
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
