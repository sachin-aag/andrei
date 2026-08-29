import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { tryRecordManualDocumentRevision } from "@/lib/document-revisions/snapshot";
import { PATCH } from "@/app/api/reports/[reportId]/sections/[sectionType]/route";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
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
  recordSectionVersion: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/document-revisions/snapshot", () => ({
  manualRevisionSummary: vi.fn(
    (_type: string, section: string) => `Edited ${section}`
  ),
  tryRecordManualDocumentRevision: vi.fn().mockResolvedValue(null),
}));

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const manager = {
  id: "manager-1",
  name: "Manager",
  email: "manager@example.com",
  role: "manager" as const,
  title: "Manager",
};

function request() {
  return new Request("http://localhost/api/reports/report-1/sections/define", {
    method: "PATCH",
    body: JSON.stringify({ content: { narrative: "Updated narrative" } }),
  });
}

function mockReportSelect(status = "draft") {
  const where = vi.fn().mockResolvedValueOnce([
    {
      id: "report-1",
      authorId: engineer.id,
      documentType: "investigation_report",
      status,
    },
  ]);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockExistingSectionSelect() {
  const where = vi.fn().mockResolvedValueOnce([
    {
      id: "section-1",
      reportId: "report-1",
      section: "define",
      content: { narrative: "Prior narrative" },
    },
  ]);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockSectionUpdate() {
  const updated = {
    id: "section-1",
    reportId: "report-1",
    section: "define",
    content: { narrative: "Updated narrative" },
  };
  const returning = vi.fn().mockResolvedValueOnce([updated]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValueOnce({ set } as never);
  return updated;
}

describe("PATCH /api/reports/[reportId]/sections/[sectionType]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await PATCH(request(), {
      params: Promise.resolve({ reportId: "report-1", sectionType: "define" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects unknown section types", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockReportSelect();

    const response = await PATCH(request(), {
      params: Promise.resolve({ reportId: "report-1", sectionType: "unknown" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid section" });
  });

  it("returns 403 when the author tries to save a submitted report", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockReportSelect("submitted");

    const response = await PATCH(request(), {
      params: Promise.resolve({ reportId: "report-1", sectionType: "define" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it.each(["submitted", "in_review"] as const)(
    "allows a manager to save a %s report",
    async (status) => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(manager);
      mockReportSelect(status);
      mockExistingSectionSelect();
      const updated = mockSectionUpdate();

      const response = await PATCH(request(), {
        params: Promise.resolve({ reportId: "report-1", sectionType: "define" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ section: updated });
      expect(db.update).toHaveBeenCalled();
      expect(tryRecordManualDocumentRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: "report-1",
          documentType: "investigation_report",
          createdBy: manager.id,
          summary: "Edited define",
        })
      );
    }
  );

  it.each(["draft", "feedback", "approved"] as const)(
    "returns 403 when a manager tries to save a %s report",
    async (status) => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(manager);
      mockReportSelect(status);

      const response = await PATCH(request(), {
        params: Promise.resolve({ reportId: "report-1", sectionType: "define" }),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
      expect(db.update).not.toHaveBeenCalled();
    }
  );
});
