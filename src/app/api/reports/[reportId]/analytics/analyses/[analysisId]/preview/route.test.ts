import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { saveAnalysisPreviewForReport } from "@/lib/statistical-analysis/store";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/lib/statistical-analysis/access", () => ({
  requireAnalyticsAccess: vi.fn(),
}));

vi.mock("@/lib/statistical-analysis/store", () => ({
  saveAnalysisPreviewForReport: vi.fn(),
}));

const params = {
  params: Promise.resolve({ reportId: "report-1", analysisId: "analysis-1" }),
};

const previewImage = {
  dataUrl: "data:image/png;base64,AAAA",
  widthPx: 600,
  heightPx: 400,
  alt: "Assay",
  chartSpec: null,
};

describe("PATCH /api/reports/[reportId]/analytics/analyses/[analysisId]/preview", () => {
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

  it("stores a preview image", async () => {
    vi.mocked(saveAnalysisPreviewForReport).mockResolvedValue({
      ok: true,
      analytics: {
        id: "ws-1",
        reportId: "report-1",
        worksheet: {
          columns: [],
          sheets: [],
          specs: [],
          activeSheetId: "data-1",
        },
        analyses: [],
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const response = await PATCH(
      new Request("http://localhost/api", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewImage }),
      }),
      params
    );
    expect(response.status).toBe(200);
    expect(saveAnalysisPreviewForReport).toHaveBeenCalledWith(
      "report-1",
      "analysis-1",
      previewImage
    );
  });
});
