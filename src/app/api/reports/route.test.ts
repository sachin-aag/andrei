import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { GET, POST } from "@/app/api/reports/route";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

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
      employeeId: "M-001",
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
});
