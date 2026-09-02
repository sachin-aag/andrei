import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CHART_LAYOUT } from "@/lib/charts/chart-spec";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { analyticsExportHref } from "./analytics-export-href";
import {
  analyticsExportFilename,
  buildAnalyticsXlsx,
  formatWorksheetSourceLine,
} from "./export-xlsx";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import {
  CAPABILITY_SIXPACK_NORMAL,
  MEASUREMENT_SCATTER,
  isScatterAnalysis,
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

describe("formatWorksheetSourceLine", () => {
  it("returns null when there are no citations", () => {
    expect(formatWorksheetSourceLine([])).toBeNull();
  });

  it("formats a single page", () => {
    expect(
      formatWorksheetSourceLine([{ attachmentId: "att_1", page: 98 }])
    ).toBe("Source : Attachment on pg (98)");
  });

  it("formats a min-max page range with a hyphen", () => {
    expect(
      formatWorksheetSourceLine([
        { attachmentId: "att_1", page: 101 },
        { attachmentId: "att_1", page: 98 },
        { attachmentId: "att_1", page: 99 },
      ])
    ).toBe("Source : Attachment on pg (98-101)");
  });
});

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

    const data = workbook.getWorksheet("Data");
    expect(data?.getCell("A1").value).toBe("Data");
    expect(data?.getCell("A1").font?.bold).toBe(true);
    expect(data?.getCell("A1").font?.size).toBe(14);
    expect(data?.getCell("A2").value).toBe("Assay");
    expect(data?.getCell("A3").value).toBe("10");

    const sixpack = workbook.getWorksheet("Assay sixpack");
    expect(sixpack?.getCell("A1").value).toBe("Assay sixpack");
    expect(sixpack?.getCell("A2").value).toBe("Field");
    expect(sixpack?.getCell("B3").value).toBe("Assay sixpack");
    expect(String(sixpack?.getCell("A1").value)).toBeTruthy();
  });

  it("puts the sheet title and attachment source on the banner row", async () => {
    const analytics = sampleAnalytics();
    const sourceLine = "Source : Attachment on pg (98-101)";
    analytics.worksheet.columns[0]!.citations = [
      { attachmentId: "att_1", page: 98 },
      { attachmentId: "att_1", page: 101 },
    ];
    analytics.worksheet.sheets[0]!.name = "Separation Force";
    const scatterAnalysis = analytics.analyses.find(isScatterAnalysis);
    if (!scatterAnalysis) throw new Error("expected measurement scatter");
    scatterAnalysis.results = {
      ...scatterAnalysis.results,
      specs: [
        {
          ...TORQUE_MOCK_SPEC,
          citations: [
            { attachmentId: "att_1", page: 98 },
            { attachmentId: "att_1", page: 101 },
          ],
        },
      ],
    };

    const buffer = await buildAnalyticsXlsx(analytics);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    const data = workbook.getWorksheet("Separation Force");
    expect(data?.getCell("A1").value).toBe("Separation Force");
    expect(data?.getCell("H1").value).toBe(sourceLine);
    expect(data?.getCell("H1").alignment?.horizontal).toBe("right");
    expect(data?.getCell("H1").font?.bold).toBe(true);
    expect(data?.getCell("A2").value).toBe("Assay");

    const sixpack = workbook.getWorksheet("Assay sixpack");
    expect(sixpack?.getCell("A1").value).toBe("Assay sixpack");
    expect(sixpack?.getCell("B1").value).toBe(sourceLine);

    const scatter = workbook.getWorksheet("Torque scatter");
    expect(scatter?.getCell("A1").value).toBe("Torque scatter");
    expect(scatter?.getCell("F1").value).toBe(sourceLine);
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
    expect(sixpack?.getImages()[0]?.range.tl.nativeRow).toBe(1);
    expect(sixpack?.getCell("A1").value).toBe("Assay sixpack");
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
    expect(images[0]?.range.tl.nativeRow).toBe(1);
    expect(images[0]?.range.tl.nativeCol).toBe(0);
    expect(sixpack?.getCell("A1").value).toBe("Assay sixpack");
    expect(sixpack?.getCell("A1").value).not.toBe("Plots");
    expect(sixpack?.getCell("A1").value).not.toBe("Field");

    const imageId = images[0]?.imageId;
    expect(imageId).toBeDefined();
    const embedded = workbook.getImage(Number(imageId));
    const bytes = embedded.buffer ?? Buffer.from(embedded.base64 ?? "", "base64");
    expect(bytes).toEqual(TINY_PNG_BYTES);
  });
});
