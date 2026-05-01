import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("rejects unknown section types before touching the database", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "engineer-1",
      name: "Engineer",
      email: "engineer@example.com",
      employeeId: "E-001",
      role: "engineer",
      title: "Quality Engineer",
    });

    const response = await PATCH(request(), {
      params: Promise.resolve({ reportId: "report-1", sectionType: "unknown" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid section" });
  });
});
