import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
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

function request() {
  return new Request("http://localhost/api/reports/report-1/sections/define", {
    method: "PATCH",
    body: JSON.stringify({ content: { narrative: "Updated narrative" } }),
  });
}

function mockReportSelect() {
  const where = vi.fn().mockResolvedValueOnce([
    {
      id: "report-1",
      authorId: "engineer-1",
      documentType: "investigation_report",
      status: "draft",
    },
  ]);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
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
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "engineer-1",
      name: "Engineer",
      email: "engineer@example.com",
      role: "engineer",
      title: "Quality Engineer",
    });
    mockReportSelect();

    const response = await PATCH(request(), {
      params: Promise.resolve({ reportId: "report-1", sectionType: "unknown" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid section" });
  });
});
