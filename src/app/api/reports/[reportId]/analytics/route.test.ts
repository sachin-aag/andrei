import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "./route";
import { POST as createAnalysis } from "./analyses/route";
import { POST as recomputeAnalysis } from "./analyses/[analysisId]/route";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import {
  createAnalysisForReport,
  getOrCreateReportAnalytics,
  recomputeAnalysisForReport,
  updateReportAnalytics,
} from "@/lib/statistical-analysis/store";
import type { ReportAnalyticsView } from "@/lib/statistical-analysis/types";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/lib/statistical-analysis/access", () => ({
  requireAnalyticsAccess: vi.fn(),
}));

vi.mock("@/lib/statistical-analysis/store", () => ({
  getOrCreateReportAnalytics: vi.fn(),
  updateReportAnalytics: vi.fn(),
  createAnalysisForReport: vi.fn(),
  recomputeAnalysisForReport: vi.fn(),
  deleteAnalysisForReport: vi.fn(),
}));

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const analytics: ReportAnalyticsView = {
  id: "ws-1",
  reportId: "report-1",
  worksheet: {
    columns: [{ id: "c1", name: "Assay", values: ["101.84", "103.12"] }],
  },
  analyses: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const params = { params: Promise.resolve({ reportId: "report-1" }) };

function okAccess(canEdit = true) {
  return {
    ok: true as const,
    user: engineer,
    report: { id: "report-1", authorId: engineer.id, status: "draft" },
    canEdit,
  };
}

describe("/api/reports/[reportId]/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pack/auth failures from requireAnalyticsAccess", async () => {
    vi.mocked(requireAnalyticsAccess).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
      }),
    } as never);

    const response = await GET(new Request("http://localhost/api/reports/report-1/analytics"), params);
    expect(response.status).toBe(404);
    expect(getOrCreateReportAnalytics).not.toHaveBeenCalled();
  });

  it("loads or creates the report worksheet", async () => {
    vi.mocked(requireAnalyticsAccess).mockResolvedValue(okAccess() as never);
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(analytics);

    const response = await GET(
      new Request("http://localhost/api/reports/report-1/analytics"),
      params
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.analytics.reportId).toBe("report-1");
    expect(getOrCreateReportAnalytics).toHaveBeenCalledWith("report-1");
  });

  it("patches worksheet JSON", async () => {
    vi.mocked(requireAnalyticsAccess).mockResolvedValue(okAccess() as never);
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(analytics);
    vi.mocked(updateReportAnalytics).mockResolvedValue(analytics);

    const response = await PATCH(
      new Request("http://localhost/api/reports/report-1/analytics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worksheet: analytics.worksheet }),
      }),
      params
    );
    expect(response.status).toBe(200);
    expect(updateReportAnalytics).toHaveBeenCalledWith(
      "report-1",
      analytics.worksheet
    );
  });

  it("accepts POST as a PATCH alias for autosave beacons", async () => {
    vi.mocked(requireAnalyticsAccess).mockResolvedValue(okAccess() as never);
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue(analytics);
    vi.mocked(updateReportAnalytics).mockResolvedValue(analytics);

    const response = await POST(
      new Request("http://localhost/api/reports/report-1/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worksheet: analytics.worksheet }),
      }),
      params
    );
    expect(response.status).toBe(200);
    expect(updateReportAnalytics).toHaveBeenCalled();
  });

  it("returns 403 when mutate access is denied", async () => {
    vi.mocked(requireAnalyticsAccess).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/reports/report-1/analytics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worksheet: analytics.worksheet }),
      }),
      params
    );
    expect(response.status).toBe(403);
    expect(updateReportAnalytics).not.toHaveBeenCalled();
  });

  it("creates a sixpack analysis", async () => {
    vi.mocked(requireAnalyticsAccess).mockResolvedValue(okAccess() as never);
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
    };
    vi.mocked(createAnalysisForReport).mockResolvedValue({
      ok: true,
      analytics: { ...analytics, analyses: [analysis as never] },
      analysis: analysis as never,
    });

    const response = await createAnalysis(
      new Request("http://localhost/api/reports/report-1/analytics/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnId: "c1",
          lsl: 90,
          usl: 110,
          target: 100,
        }),
      }),
      params
    );
    expect(response.status).toBe(201);
  });

  it("recomputes an analysis", async () => {
    vi.mocked(requireAnalyticsAccess).mockResolvedValue(okAccess() as never);
    vi.mocked(recomputeAnalysisForReport).mockResolvedValue({
      ok: true,
      analytics,
      analysis: {
        id: "an-1",
        workspaceId: "ws-1",
        kind: "capability_sixpack_normal",
        title: "Assay",
        config: {
          columnId: "c1",
          columnName: "Assay",
          title: "Assay",
          lsl: 90,
          usl: 110,
          target: 100,
        },
        results: { n: 2 },
        sourceHash: "abc",
        stale: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      } as never,
    });

    const response = await recomputeAnalysis(
      new Request(
        "http://localhost/api/reports/report-1/analytics/analyses/an-1",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "recompute" }),
        }
      ),
      { params: Promise.resolve({ reportId: "report-1", analysisId: "an-1" }) }
    );
    expect(response.status).toBe(200);
    expect(recomputeAnalysisForReport).toHaveBeenCalledWith(
      "report-1",
      "an-1"
    );
  });
});
