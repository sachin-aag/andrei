import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { getOrCreateReportAnalytics } from "@/lib/statistical-analysis/store";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/lib/statistical-analysis/access", () => ({
  requireAnalyticsAccess: vi.fn(),
}));

vi.mock("@/lib/statistical-analysis/store", () => ({
  getOrCreateReportAnalytics: vi.fn(),
}));

const params = {
  params: Promise.resolve({ reportId: "report-1", analysisId: "analysis-1" }),
};

describe("GET /api/reports/[reportId]/analytics/analyses/[analysisId]/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAnalyticsAccess).mockResolvedValue({
      ok: true,
      user: {
        id: "u1",
        name: "Engineer",
        email: "engineer@example.com",
        role: "engineer",
        title: "QE",
      },
      report: { id: "report-1", authorId: "u1", status: "draft" },
      canEdit: true,
    } as never);
  });

  it("returns a PNG payload for a scatter analysis", async () => {
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue({
      id: "ws-1",
      reportId: "report-1",
      worksheet: {
        columns: [],
        sheets: [],
        specs: [],
        activeSheetId: "data-1",
      },
      analyses: [
        {
          id: "analysis-1",
          workspaceId: "ws-1",
          title: "Torque",
          kind: "measurement_scatter",
          sourceHash: "hash",
          stale: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          config: {
            query: "torque",
            title: "Torque",
            xLabel: "Unit",
            yLabel: "Torque",
            layout: {
              mode: "combined",
              seriesBy: "none",
              xAxis: "sequential",
              yRange: null,
            },
            lsl: null,
            usl: null,
          },
          results: {
            specs: [TORQUE_MOCK_SPEC],
            n: TORQUE_MOCK_SPEC.points.length,
            uom: "Nm",
          },
        },
      ],
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await GET(
      new Request("http://localhost/api"),
      params
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      image: { dataUrl: string; alt: string };
    };
    expect(body.image.alt).toBe(TORQUE_MOCK_SPEC.title);
    expect(body.image.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
