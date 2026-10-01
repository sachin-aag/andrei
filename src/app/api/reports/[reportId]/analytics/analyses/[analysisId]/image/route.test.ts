import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { getOrCreateReportAnalytics } from "@/lib/statistical-analysis/store";
import { renderAnalyticsInsertImage } from "@/lib/statistical-analysis/render-analysis-plots";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/lib/statistical-analysis/access", () => ({
  requireAnalyticsAccess: vi.fn(),
}));

vi.mock("@/lib/statistical-analysis/store", () => ({
  getOrCreateReportAnalytics: vi.fn(),
}));

// The route owns the fallback branching; the pixels belong to the renderer,
// which the DOCX export path already covers.
vi.mock("@/lib/statistical-analysis/render-analysis-plots", () => ({
  renderAnalyticsInsertImage: vi.fn(async () => ({
    dataUrl: "data:image/png;base64,RENDERED",
    widthPx: 640,
    heightPx: 420,
  })),
}));

const params = {
  params: Promise.resolve({ reportId: "report-1", analysisId: "analysis-1" }),
};

const previewImage = {
  dataUrl: "data:image/png;base64,AAAA",
  widthPx: 600,
  heightPx: 400,
  alt: TORQUE_MOCK_SPEC.title,
  chartSpec: TORQUE_MOCK_SPEC,
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

  it("returns the stored preview image", async () => {
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
          previewImage,
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
    expect(body.image).toEqual(previewImage);
  });

  it("renders on demand when nobody opened the plot", async () => {
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
          previewImage: null,
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
    // previewImage is captured from the rendered DOM, so a plot created
    // headlessly by chat has none. Returning 404 here is what put "open it in
    // Analytics first" in front of the engineer.
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      image: { dataUrl: string; alt: string; widthPx: number };
    };
    expect(body.image.dataUrl).toMatch(/^data:image\//);
    expect(body.image.alt).toBe("Torque");
    expect(body.image.widthPx).toBeGreaterThan(0);
  });

  it("404s only when the analysis cannot be rendered at all", async () => {
    vi.mocked(renderAnalyticsInsertImage).mockResolvedValueOnce(null);
    vi.mocked(getOrCreateReportAnalytics).mockResolvedValue({
      id: "ws-1",
      reportId: "report-1",
      worksheet: { columns: [], sheets: [], specs: [], activeSheetId: "data-1" },
      analyses: [
        {
          id: "analysis-1",
          workspaceId: "ws-1",
          title: "Assay by lot",
          kind: "one_way_anova",
          sourceHash: "hash",
          stale: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          previewImage: null,
          config: { responseColumnId: "c1", factorColumnId: "c2", title: "Assay by lot" },
          results: {},
        },
      ],
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);

    const response = await GET(new Request("http://localhost/api"), params);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_renderable" });
  });
});
