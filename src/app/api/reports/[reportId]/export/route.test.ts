import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/user-directory", () => ({
  hydrateUserDirectory: vi.fn(),
}));

vi.mock("@/lib/auth/workspace-users", () => ({
  listWorkspaceUsers: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  listReportSignatures: vi.fn(),
}));

vi.mock("@/lib/export/generate-docx", () => ({
  generateReportDocx: vi.fn(),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hydrateUserDirectory } from "@/lib/auth/user-directory";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { listReportSignatures } from "@/lib/audit";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { GET } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const otherEngineer = {
  id: "engineer-2",
  name: "Other Engineer",
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

function request() {
  return new Request("http://localhost/api/reports/report-1/export");
}

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

describe("GET /api/reports/[reportId]/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkspaceUsers).mockResolvedValue([]);
    vi.mocked(listReportSignatures).mockResolvedValue([]);
    vi.mocked(generateReportDocx).mockResolvedValue(Buffer.from("docx"));
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET(request(), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
    expect(generateReportDocx).not.toHaveBeenCalled();
  });

  it("returns 403 before loading export data when an engineer exports another author's draft", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(otherEngineer);
    mockSelectOnce([report]);
    mockOrderedSelectOnce([]);

    const response = await GET(request(), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(listWorkspaceUsers).not.toHaveBeenCalled();
    expect(hydrateUserDirectory).not.toHaveBeenCalled();
    expect(listReportSignatures).not.toHaveBeenCalled();
    expect(generateReportDocx).not.toHaveBeenCalled();
  });

  it("allows the author to export their report", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockSelectOnce([report]);
    mockOrderedSelectOnce([{ managerId: "manager-1" }]);
    mockSelectOnce([]);
    mockSelectOnce([]);

    const response = await GET(request(), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(generateReportDocx).toHaveBeenCalledWith(
      expect.objectContaining({
        report: expect.objectContaining({
          id: report.id,
          assignedManagerIds: ["manager-1"],
        }),
      })
    );
  });
});
