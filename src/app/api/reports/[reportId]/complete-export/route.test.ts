import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/reports/complete-export", () => ({
  buildCompleteRecordExportZip: vi.fn(),
}));

vi.mock("@/lib/reports/managers", () => ({
  listReportManagerIds: vi.fn(),
  withAssignedManagerIds: vi.fn((report, managerIds: string[]) => ({
    ...report,
    assignedManagerIds: managerIds,
  })),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { buildCompleteRecordExportZip } from "@/lib/reports/complete-export";
import { listReportManagerIds } from "@/lib/reports/managers";
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
  email: "admin@example.com",
  role: "admin" as const,
  title: "Admin",
};

const report = {
  id: "report-1",
  authorId: engineer.id,
  assignedManagerId: null,
  status: "approved",
  deviationNo: "DEV-001",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  deletedAt: null,
};

function request() {
  return new Request("http://localhost/api/reports/report-1/complete-export");
}

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("GET /api/reports/[reportId]/complete-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listReportManagerIds).mockResolvedValue([]);
    vi.mocked(buildCompleteRecordExportZip).mockResolvedValue({
      buffer: Buffer.from("zip"),
      deviationNo: report.deviationNo,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET(request(), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(401);
    expect(buildCompleteRecordExportZip).not.toHaveBeenCalled();
  });

  it("returns 403 when the user cannot view the report", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      ...engineer,
      id: "other-engineer",
    });
    mockSelectOnce([report]);

    const response = await GET(request(), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(403);
    expect(buildCompleteRecordExportZip).not.toHaveBeenCalled();
  });

  it("omits audit trail artifacts for non-admin viewers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockSelectOnce([report]);

    const response = await GET(request(), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(200);
    expect(buildCompleteRecordExportZip).toHaveBeenCalledWith(report.id, {
      includeAuditTrail: false,
    });
  });

  it("includes audit trail artifacts for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);
    mockSelectOnce([report]);

    const response = await GET(request(), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(200);
    expect(buildCompleteRecordExportZip).toHaveBeenCalledWith(report.id, {
      includeAuditTrail: true,
    });
  });
});
