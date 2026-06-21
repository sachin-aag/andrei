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
import { POST } from "@/app/api/reports/[reportId]/submit/route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const report = {
  id: "report-1",
  authorId: engineer.id,
  status: "draft",
};

function signedRequest() {
  return new Request("http://localhost/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "Secret123!" }),
  });
}

describe("POST /api/reports/[reportId]/submit", () => {
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

  it("returns 404 when report is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(handleWorkflowSignRequest).mockResolvedValueOnce(
      NextResponse.json({ error: "Not found" }, { status: 404 })
    );

    const response = await POST(signedRequest(), {
      params: Promise.resolve({ reportId: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 403 when caller is not the author", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(handleWorkflowSignRequest).mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await POST(signedRequest(), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(403);
  });

  it("submits draft report", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(handleWorkflowSignRequest).mockResolvedValueOnce(
      NextResponse.json({ report: { ...report, status: "submitted" } })
    );

    const response = await POST(signedRequest(), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      report: { ...report, status: "submitted" },
    });
    expect(handleWorkflowSignRequest).toHaveBeenCalledWith(
      expect.any(Request),
      report.id,
      expect.objectContaining({ meaning: "submission", newStatus: "submitted" })
    );
  });
});
