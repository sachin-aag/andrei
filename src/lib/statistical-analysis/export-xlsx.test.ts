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
import { listZipPaths, zipText } from "./excel-chart-xml";
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

  it("uses the document name when no page is available", () => {
    expect(
      formatWorksheetSourceLine([
        {
          attachmentId: "att_1",
          page: null,
          filename: "Mechanical Test Report.pdf",
        },
      ])
    ).toBe("Source : Mechanical Test Report.pdf");
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
    expect(
      listZipPaths(buffer).some((path) => path.startsWith("xl/charts/"))
    ).toBe(false);
  });

  it("writes numeric observation values so Excel can chart them", async () => {
    const buffer = await buildAnalyticsXlsx(sampleAnalytics());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sixpack = workbook.getWorksheet("Assay sixpack");
    const scatter = workbook.getWorksheet("Torque scatter");
    let indexRow = 0;
    sixpack?.eachRow((row, number) => {
      if (row.getCell(1).value === "Index") indexRow = number;
    });
    expect(indexRow).toBeGreaterThan(0);
    expect(sixpack?.getCell(indexRow + 1, 1).value).toBe(1);
    expect(sixpack?.getCell(indexRow + 1, 2).value).toBe(10);

    let xyHeader = 0;
    scatter?.eachRow((row, number) => {
      if (row.getCell(1).value === "Chart") xyHeader = number;
    });
    expect(xyHeader).toBeGreaterThan(0);
    expect(typeof scatter?.getCell(xyHeader + 1, 4).value).toBe("number");
    expect(typeof scatter?.getCell(xyHeader + 1, 5).value).toBe("number");
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

  it("embeds native Excel charts bound to numeric source tables", async () => {
    const buffer = await buildAnalyticsXlsx(sampleAnalytics(), {
      includePlots: true,
    });
    const paths = listZipPaths(buffer);
    expect(paths.some((path) => path.startsWith("xl/charts/chart"))).toBe(true);
    expect(paths.some((path) => path.startsWith("xl/drawings/drawing"))).toBe(
      true
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sixpack = workbook.getWorksheet("Assay sixpack");
    const scatter = workbook.getWorksheet("Torque scatter");
    expect(sixpack?.getImages() ?? []).toEqual([]);
    expect(scatter?.getImages() ?? []).toEqual([]);
    expect(sixpack?.getCell("A1").value).toBe("Assay sixpack");
    expect(sixpack?.getCell("A1").value).not.toBe("Plots");

    const chartXml = [...paths]
      .filter((path) => path.startsWith("xl/charts/chart"))
      .map((path) => zipText(buffer, path) ?? "");
    expect(chartXml.some((xml) => xml.includes("c:scatterChart"))).toBe(true);
    expect(chartXml.some((xml) => xml.includes("c:lineChart"))).toBe(true);
    expect(chartXml.join("")).toContain("Assay sixpack");
    expect(chartXml.join("")).toMatch(/Torque|Tip Detachment/);
    const histogramXml = chartXml.find(
      (xml) =>
        xml.includes("Capability Histogram") && xml.includes("c:barChart")
    );
    expect(histogramXml).toBeDefined();
    expect(histogramXml).toContain("c:lineChart");
    expect(histogramXml).toContain('<c:smooth val="1"/>');
    expect(histogramXml).toContain('<c:gapWidth val="0"/>');
    expect(histogramXml).toMatch(/<c:ptCount val="8[0-9]"\/>/);
  });

  it("does not embed a PNG snapshot when a preview image exists", async () => {
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
    expect(sixpack?.getImages() ?? []).toEqual([]);
    expect(sixpack?.getCell("A1").value).toBe("Assay sixpack");
    expect(listZipPaths(buffer).some((path) => path.includes("xl/media/"))).toBe(
      false
    );
    expect(
      listZipPaths(buffer).some((path) => path.startsWith("xl/charts/chart"))
    ).toBe(true);
  });
});
