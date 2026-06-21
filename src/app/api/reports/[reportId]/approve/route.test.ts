import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit/workflow-handler", () => ({
  handleWorkflowSignRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/session";
import { handleWorkflowSignRequest } from "@/lib/audit/workflow-handler";
import { POST } from "@/app/api/reports/[reportId]/approve/route";

const manager = {
  id: "manager-1",
  name: "Manager",
  email: "manager@example.com",
  role: "manager" as const,
  title: "QA Manager",
};

function signedRequest() {
  return new Request("http://localhost/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "Secret123!" }),
  });
}

describe("POST /api/reports/[reportId]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(signedRequest(), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 for non-managers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "engineer-1",
      name: "Engineer",
      email: "engineer@example.com",
      role: "engineer",
      title: "Engineer",
    });

    const response = await POST(signedRequest(), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 when report is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(manager);
    vi.mocked(handleWorkflowSignRequest).mockResolvedValueOnce(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );

    const response = await POST(signedRequest(), {
      params: Promise.resolve({ reportId: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  it("approves report for managers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(manager);
    vi.mocked(handleWorkflowSignRequest).mockResolvedValueOnce(
      NextResponse.json({ report: { id: "report-1", status: "approved" } })
    );

    const response = await POST(signedRequest(), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      report: { id: "report-1", status: "approved" },
    });
  });
});
