import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditActorFromUser: vi.fn((user: { id: string; name: string; role: string }) => ({
    id: user.id,
    name: user.name,
    role: user.role,
  })),
  recordAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { GET, PATCH } from "./route";

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
  date: new Date("2026-01-01T00:00:00.000Z"),
  toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
  otherTools: "",
};

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockOrderedSelectOnce(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValueOnce(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockBundleSelects() {
  mockSelectOnce([report]);
  mockOrderedSelectOnce([]);
  mockSelectOnce([]);
  mockSelectOnce([]);
  mockSelectOnce([]);
  mockSelectOnce([]);
}

function mockManagerValidation(managerIds: string[]) {
  for (let i = 0; i < 2; i++) {
    mockSelectOnce(managerIds.map((id) => ({ id })));
  }
}

function mockUpdateOnce(row: unknown) {
  const returning = vi.fn().mockResolvedValueOnce([row]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValueOnce({ set } as never);
  return { set };
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
    mockOrderedSelectOnce([]);

    const response = await GET(new Request("http://localhost/api/reports/report-1"), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(403);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("updates multiple assigned managers for the report author", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockSelectOnce([{ ...report, assignedManagerId: "manager-1" }]);
    mockOrderedSelectOnce([{ managerId: "manager-1" }]);
    mockManagerValidation(["manager-2", "manager-3"]);
    const { set } = mockUpdateOnce({
      ...report,
      assignedManagerId: "manager-2",
    });
    const deleteWhere = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(db.delete).mockReturnValueOnce({ where: deleteWhere } as never);
    const insertValues = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(db.insert).mockReturnValueOnce({ values: insertValues } as never);

    const response = await PATCH(
      new Request("http://localhost/api/reports/report-1", {
        method: "PATCH",
        body: JSON.stringify({
          assignedManagerIds: ["manager-2", "manager-3"],
        }),
      }),
      { params: Promise.resolve({ reportId: report.id }) }
    );

    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ assignedManagerId: "manager-2" })
    );
    expect(insertValues).toHaveBeenCalledWith([
      { reportId: report.id, managerId: "manager-2", sortOrder: 0 },
      { reportId: report.id, managerId: "manager-3", sortOrder: 1 },
    ]);
    await expect(response.json()).resolves.toMatchObject({
      report: { assignedManagerIds: ["manager-2", "manager-3"] },
    });
  });
});
