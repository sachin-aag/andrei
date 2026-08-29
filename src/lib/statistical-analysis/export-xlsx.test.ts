import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CHART_LAYOUT } from "@/lib/charts/chart-spec";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { analyticsExportHref } from "./analytics-export-href";
import { analyticsExportFilename, buildAnalyticsXlsx } from "./export-xlsx";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import {
  CAPABILITY_SIXPACK_NORMAL,
  MEASUREMENT_SCATTER,
  type ReportAnalyticsView,
} from "./types";
import { createEmptyWorksheet } from "./worksheet";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function sampleAnalytics(): ReportAnalyticsView {
  const outcome = computeCapabilitySixpackFromValues(
    [10, 12, 11, 13, 14, 11, 12, 13],
    0,
    {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay",
      lsl: 8,
      usl: 16,
      target: 12,
    }
  );
  if (!outcome.ok) throw new Error(outcome.message);
  const worksheet = createEmptyWorksheet();
  worksheet.columns[0]!.name = "Assay";
  worksheet.columns[0]!.values = ["10", "12", "11", "13", "14"];
  return {
    id: "ws-1",
    reportId: "report-1",
    worksheet,
    analyses: [
      {
        id: "an-1",
        workspaceId: "ws-1",
        kind: CAPABILITY_SIXPACK_NORMAL,
        title: "Assay sixpack",
        config: {
          columnId: "c1",
          columnName: "Assay",
          title: "Assay sixpack",
          lsl: 8,
          usl: 16,
          target: 12,
        },
        results: outcome.result,
        sourceHash: "abc",
        stale: false,
        createdAt: "2026-08-26T00:00:00.000Z",
        previewImage: null,
      },
      {
        id: "an-2",
        workspaceId: "ws-1",
        kind: MEASUREMENT_SCATTER,
        title: "Torque scatter",
        config: {
          query: "torque",
          title: "Torque scatter",
          xLabel: "Index",
          yLabel: "Torque",
          layout: { ...DEFAULT_CHART_LAYOUT, seriesBy: "none" },
          lsl: null,
          usl: null,
        },
        results: {
          specs: [TORQUE_MOCK_SPEC],
          n: TORQUE_MOCK_SPEC.points.length,
          uom: TORQUE_MOCK_SPEC.uom,
        },
        sourceHash: "def",
        stale: false,
        createdAt: "2026-08-26T00:00:00.000Z",
        previewImage: null,
      },
    ],
    version: 1,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

describe("analyticsExportHref", () => {
  it("builds export URLs with optional plots flag", () => {
    expect(analyticsExportHref("r1", false)).toBe(
      "/api/reports/r1/analytics/export"
    );
    expect(analyticsExportHref("r1", true)).toBe(
      "/api/reports/r1/analytics/export?plots=1"
    );
  });
});

describe("analyticsExportFilename", () => {
  it("uses the document number when present", () => {
    expect(analyticsExportFilename("DEV-2026-001")).toBe(
      "DEV-2026-001-analytics.xlsx"
    );
    expect(analyticsExportFilename(null)).toBe("report-analytics.xlsx");
  });
});

describe("buildAnalyticsXlsx", () => {
  it("writes worksheet tabs and analysis sheets", async () => {
    const buffer = await buildAnalyticsXlsx(sampleAnalytics());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Data",
      "Assay sixpack",
      "Torque scatter",
    ]);

    const sixpack = workbook.getWorksheet("Assay sixpack");
    expect(sixpack?.getCell("A1").value).toBe("Field");
    expect(sixpack?.getCell("B2").value).toBe("Assay sixpack");
    expect(String(sixpack?.getCell("A1").value)).toBeTruthy();
  });

  it("embeds plot images when includePlots is true", async () => {
    const buffer = await buildAnalyticsXlsx(sampleAnalytics(), {
      includePlots: true,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    const sixpack = workbook.getWorksheet("Assay sixpack");
    const scatter = workbook.getWorksheet("Torque scatter");
    expect(sixpack?.getImages().length).toBeGreaterThan(0);
    expect(scatter?.getImages().length).toBeGreaterThan(0);
    expect(sixpack?.getImages()[0]?.range.tl.nativeRow).toBe(0);
    expect(sixpack?.getCell("A1").value).not.toBe("Plots");

    const imageId = sixpack?.getImages()[0]?.imageId;
    expect(imageId).toBeDefined();
    const embedded = workbook.getImage(Number(imageId));
    const png = embedded.buffer
      ? Buffer.from(embedded.buffer)
      : Buffer.from(embedded.base64 ?? "", "base64");
    expect(png.byteLength).toBeGreaterThan(20_000);
  });

  it("embeds the captured preview at the top of the analysis sheet", async () => {
    const analytics = sampleAnalytics();
    const sixpackAnalysis = analytics.analyses[0]!;
    analytics.analyses[0] = {
      ...sixpackAnalysis,
      previewImage: {
        dataUrl: TINY_PNG,
        widthPx: 40,
        heightPx: 40,
        alt: "Assay sixpack",
        chartSpec: null,
      },
    };

    const buffer = await buildAnalyticsXlsx(analytics, { includePlots: true });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    const sixpack = workbook.getWorksheet("Assay sixpack");
    const images = sixpack?.getImages() ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]?.range.tl.nativeRow).toBe(0);
    expect(images[0]?.range.tl.nativeCol).toBe(0);
    expect(sixpack?.getCell("A1").value).not.toBe("Plots");
    expect(sixpack?.getCell("A1").value).not.toBe("Field");

    const imageId = images[0]?.imageId;
    expect(imageId).toBeDefined();
    const embedded = workbook.getImage(Number(imageId));
    const bytes = embedded.buffer ?? Buffer.from(embedded.base64 ?? "", "base64");
    expect(bytes).toEqual(TINY_PNG_BYTES);
  });
});
