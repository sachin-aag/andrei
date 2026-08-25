import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import {
  createWorkspaceForUser,
  listWorkspacesForUser,
} from "@/lib/statistical-analysis/store";
import { GET, POST } from "./route";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    isStatisticalAnalysisEnabled: vi.fn(() => true),
  };
});

vi.mock("@/lib/statistical-analysis/store", () => ({
  listWorkspacesForUser: vi.fn(),
  createWorkspaceForUser: vi.fn(),
}));

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const workspace = {
  id: "ws-1",
  name: "Untitled worksheet",
  ownerId: engineer.id,
  worksheet: { columns: [{ id: "c1", name: "C1", values: [] }] },
  analyses: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("GET/POST /api/statistical-analysis/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStatisticalAnalysisEnabled).mockReturnValue(true);
  });

  it("returns 404 when the customer pack disables statistical analysis", async () => {
    vi.mocked(isStatisticalAnalysisEnabled).mockReturnValue(false);
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);

    const response = await GET();
    expect(response.status).toBe(404);
    expect(listWorkspacesForUser).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated list requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("lists workspaces for the signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(listWorkspacesForUser).mockResolvedValue([
      {
        id: workspace.id,
        name: workspace.name,
        ownerId: engineer.id,
        analysisCount: 0,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      },
    ]);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workspaces).toHaveLength(1);
    expect(listWorkspacesForUser).toHaveBeenCalledWith(engineer.id);
  });

  it("creates a worksheet", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(createWorkspaceForUser).mockResolvedValue(workspace);

    const response = await POST(
      new Request("http://localhost/api/statistical-analysis/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Assay" }),
      })
    );
    expect(response.status).toBe(201);
    expect(createWorkspaceForUser).toHaveBeenCalledWith(engineer.id, "Assay");
  });
});

describe("pack 404 helper", () => {
  it("uses a JSON 404 body", async () => {
    vi.mocked(isStatisticalAnalysisEnabled).mockReturnValue(false);
    const response = await GET();
    expect(response).toBeInstanceOf(NextResponse);
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});
