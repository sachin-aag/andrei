import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import {
  createAnalysisForUser,
  getWorkspaceForUser,
  recomputeAnalysisForUser,
  updateWorkspaceForUser,
} from "@/lib/statistical-analysis/store";
import type { StatisticalAnalysisSummary } from "@/lib/statistical-analysis/types";
import { GET, PATCH, POST } from "./route";
import { POST as createAnalysis } from "./analyses/route";
import { POST as recomputeAnalysis } from "./analyses/[analysisId]/route";

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
  getWorkspaceForUser: vi.fn(),
  updateWorkspaceForUser: vi.fn(),
  deleteWorkspaceForUser: vi.fn(),
  createAnalysisForUser: vi.fn(),
  recomputeAnalysisForUser: vi.fn(),
  deleteAnalysisForUser: vi.fn(),
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
  name: "Assay",
  ownerId: engineer.id,
  worksheet: {
    columns: [{ id: "c1", name: "Assay", values: ["101.84", "103.12"] }],
  },
  analyses: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const analysis = {
  id: "an-1",
  workspaceId: "ws-1",
  kind: "capability_sixpack_normal" as const,
  title: "Assay",
  config: {
    columnId: "c1",
    columnName: "Assay",
    title: "Assay",
    lsl: 90,
    usl: 110,
    target: 100,
  },
  results: { n: 2, mean: 102.48 },
  sourceHash: "abc",
  stale: false,
  createdAt: "2026-01-01T00:00:00.000Z",
} as unknown as StatisticalAnalysisSummary;

const params = { params: Promise.resolve({ workspaceId: "ws-1" }) };

describe("/api/statistical-analysis/workspaces/[workspaceId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStatisticalAnalysisEnabled).mockReturnValue(true);
  });

  it("returns 404 when the pack is off", async () => {
    vi.mocked(isStatisticalAnalysisEnabled).mockReturnValue(false);
    const response = await GET(
      new Request("http://localhost/api/statistical-analysis/workspaces/ws-1"),
      params
    );
    expect(response.status).toBe(404);
  });

  it("loads a workspace the user owns", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(getWorkspaceForUser).mockResolvedValue(workspace);

    const response = await GET(
      new Request("http://localhost/api/statistical-analysis/workspaces/ws-1"),
      params
    );
    expect(response.status).toBe(200);
    expect(getWorkspaceForUser).toHaveBeenCalledWith("ws-1", engineer.id);
  });

  it("patches worksheet JSON", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(updateWorkspaceForUser).mockResolvedValue(workspace);

    const response = await PATCH(
      new Request("http://localhost/api/statistical-analysis/workspaces/ws-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Assay lab" }),
      }),
      params
    );
    expect(response.status).toBe(200);
    expect(updateWorkspaceForUser).toHaveBeenCalledWith("ws-1", engineer.id, {
      name: "Assay lab",
    });
  });

  it("accepts POST as a PATCH alias for autosave beacons", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(updateWorkspaceForUser).mockResolvedValue(workspace);

    const response = await POST(
      new Request("http://localhost/api/statistical-analysis/workspaces/ws-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worksheet: workspace.worksheet }),
      }),
      params
    );
    expect(response.status).toBe(200);
    expect(updateWorkspaceForUser).toHaveBeenCalled();
  });

  it("creates a sixpack analysis", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(createAnalysisForUser).mockResolvedValue({
      ok: true,
      workspace: { ...workspace, analyses: [analysis] },
      analysis,
    });

    const response = await createAnalysis(
      new Request(
        "http://localhost/api/statistical-analysis/workspaces/ws-1/analyses",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columnId: "c1",
            lsl: 90,
            usl: 110,
            target: 100,
          }),
        }
      ),
      params
    );
    expect(response.status).toBe(201);
  });

  it("returns 400 when sixpack input is rejected", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(createAnalysisForUser).mockResolvedValue({
      ok: false,
      status: 400,
      error: "Enter a lower spec, an upper spec, or both.",
    });

    const response = await createAnalysis(
      new Request(
        "http://localhost/api/statistical-analysis/workspaces/ws-1/analyses",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columnId: "c1",
            lsl: null,
            usl: null,
            target: null,
          }),
        }
      ),
      params
    );
    expect(response.status).toBe(400);
  });

  it("recomputes an analysis", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(recomputeAnalysisForUser).mockResolvedValue({
      ok: true,
      workspace: { ...workspace, analyses: [analysis] },
      analysis,
    });

    const response = await recomputeAnalysis(
      new Request(
        "http://localhost/api/statistical-analysis/workspaces/ws-1/analyses/an-1",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "recompute" }),
        }
      ),
      { params: Promise.resolve({ workspaceId: "ws-1", analysisId: "an-1" }) }
    );
    expect(response.status).toBe(200);
    expect(recomputeAnalysisForUser).toHaveBeenCalledWith(
      "ws-1",
      "an-1",
      engineer.id
    );
  });
});
