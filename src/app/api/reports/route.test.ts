import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { DUPLICATE_DEVIATION_NO_ERROR } from "@/lib/reports/deviation-no";
import { GET, POST } from "@/app/api/reports/route";

vi.mock("@/db", () => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(() => {
      throw new Error("No transactions support in neon-http driver");
    }),
  };
  return { db };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/reports/deviation-no", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/deviation-no")>();
  return {
    ...actual,
    isDeviationNoTaken: vi.fn(),
  };
});

vi.mock("@/lib/audit", () => ({
  auditActorFromUser: vi.fn((user: { id: string; name: string; role: string }) => ({
    id: user.id,
    name: user.name,
    role: user.role,
  })),
  recordAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
  recordSectionVersion: vi.fn().mockResolvedValue(null),
}));

import { db } from "@/db";
import { isDeviationNoTaken } from "@/lib/reports/deviation-no";
import { EMPTY_CONTENT, REPORT_SECTION_ROW_ORDER } from "@/types/sections";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

function mockSuccessfulCreate(reportId = "report-1") {
  const returning = vi.fn().mockResolvedValue([
    {
      id: reportId,
      deviationNo: "DEV-001",
      authorId: engineer.id,
      status: "draft",
    },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as never);
  return { returning, values };
}

function mockSectionRowsSelect(reportId: string) {
  const where = vi.fn().mockResolvedValueOnce(
    REPORT_SECTION_ROW_ORDER.map((section, index) => ({
      id: `section-${index}`,
      reportId,
      section,
      content: EMPTY_CONTENT[section],
    }))
  );
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockManagerValidation(managerIds: string[]) {
  for (let i = 0; i < 2; i++) {
    const where = vi.fn().mockResolvedValueOnce(
      managerIds.map((id) => ({ id }))
    );
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValueOnce({ from } as never);
  }
}

describe("/api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication for listing reports", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("does not list report queues for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "admin",
      title: "Admin",
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("requires authentication for report creation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("prevents managers from creating reports", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "manager-1",
      name: "Manager",
      email: "manager@example.com",
      role: "manager",
      title: "QA Manager",
    });

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only engineers can create reports",
    });
  });

  it("rejects duplicate deviation numbers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "engineer-1",
      name: "Engineer",
      email: "engineer@example.com",
      role: "engineer",
      title: "Quality Engineer",
    });
    vi.mocked(isDeviationNoTaken).mockResolvedValueOnce(true);

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: DUPLICATE_DEVIATION_NO_ERROR,
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("checks duplicates using the user-entered deviation number", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "engineer-1",
      name: "Engineer",
      email: "engineer@example.com",
      role: "engineer",
      title: "Quality Engineer",
    });
    vi.mocked(isDeviationNoTaken).mockResolvedValueOnce(true);

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "dev pr 24 016" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(isDeviationNoTaken).toHaveBeenCalledWith("dev pr 24 016", "engineer-1");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates a report from JSON payload", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(isDeviationNoTaken).mockResolvedValueOnce(false);
    mockSuccessfulCreate();
    mockSectionRowsSelect("report-1");

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({ deviationNo: "DEV-001" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("creates a report with multiple assigned managers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(isDeviationNoTaken).mockResolvedValueOnce(false);
    mockManagerValidation(["manager-1", "manager-2"]);
    const { values } = mockSuccessfulCreate("report-multi-manager");
    mockSectionRowsSelect("report-multi-manager");

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({
          deviationNo: "DEV-001",
          assignedManagerIds: ["manager-1", "manager-2"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ assignedManagerId: "manager-1" })
    );
    expect(values).toHaveBeenNthCalledWith(2, [
      { reportId: "report-multi-manager", managerId: "manager-1", sortOrder: 0 },
      { reportId: "report-multi-manager", managerId: "manager-2", sortOrder: 1 },
    ]);
    await expect(response.json()).resolves.toMatchObject({
      report: { assignedManagerIds: ["manager-1", "manager-2"] },
    });
  });
});
