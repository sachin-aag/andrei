import ExcelJS from "exceljs";
import { CHART_MARK_LABELS, parseChartMark } from "@/lib/charts/chart-marks";
import { formatPValue, formatPpm, formatStat } from "./format";
import { plotImagesForExport } from "./render-analysis-plots";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "./row-selection";
import {
  isAnovaAnalysis,
  isObservationXyScatter,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type ReportAnalyticsView,
  type StatisticalAnalysisSummary,
  type WorksheetData,
  type WorksheetSheet,
} from "./types";

export type BuildAnalyticsXlsxOptions = {
  includePlots?: boolean;
};

const INVALID_SHEET_CHARS = /[*?:/\\[\]]/g;

function safeSheetName(base: string, used: Set<string>): string {
  const cleaned = base
    .trim()
    .replace(INVALID_SHEET_CHARS, " ")
    .replace(/\s+/g, " ")
    .slice(0, 31)
    .trim();
  let candidate = cleaned || "Sheet";
  let suffix = 2;
  while (used.has(candidate)) {
    const tail = ` (${suffix})`;
    candidate = `${(cleaned || "Sheet").slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function addRows(
  sheet: ExcelJS.Worksheet,
  rows: Array<Array<string | number | null | undefined>>
): void {
  for (const row of rows) {
    sheet.addRow(row.map((cell) => cell ?? ""));
  }
}

function addWorksheetSheet(
  workbook: ExcelJS.Workbook,
  sheetData: WorksheetSheet,
  usedNames: Set<string>
): void {
  const sheet = workbook.addWorksheet(safeSheetName(sheetData.name, usedNames));
  const maxRows = Math.max(
    ...sheetData.columns.map((column) => column.values.length),
    0
  );
  sheet.addRow(sheetData.columns.map((column) => column.name));
  for (let row = 0; row < maxRows; row += 1) {
    sheet.addRow(
      sheetData.columns.map((column) => column.values[row] ?? "")
    );
  }
}

function addSpecsSheet(
  workbook: ExcelJS.Workbook,
  worksheet: WorksheetData,
  usedNames: Set<string>
): void {
  if (worksheet.specs.length === 0) return;
  const sheet = workbook.addWorksheet(safeSheetName("Specs", usedNames));
  sheet.addRow(["Column", "LSL", "USL", "Target"]);
  for (const spec of worksheet.specs) {
    sheet.addRow([spec.columnName, spec.lsl, spec.usl, spec.target]);
  }
}

function sixpackRows(analysis: StatisticalAnalysisSummary): Array<string[][]> {
  if (!isSixpackAnalysis(analysis)) return [];
  const { config, results } = analysis;
  const rows = formatRowSelection(normalizeRowSelection(config)) || "all";
  const cap = results.capability;
  return [
    [
      ["Field", "Value"],
      ["Title", analysis.title],
      ["Column", config.columnName],
      ["Rows", rows],
      ["Kind", "Normal Capability Sixpack (I-MR)"],
      ["LSL", formatStat(config.lsl)],
      ["Target", formatStat(config.target)],
      ["USL", formatStat(config.usl)],
      ["Created", analysis.createdAt],
    ],
    [
      ["Metric", "Value"],
      ["Sample N", String(results.n)],
      ["Skipped", String(results.skipped)],
      ["Mean", formatStat(results.mean)],
      ["StDev (overall)", formatStat(results.overallStdev)],
      ["StDev (within)", formatStat(results.withinStdev)],
      ["MR-bar", formatStat(results.mrBar)],
      ["Cp", formatStat(cap.cp)],
      ["Cpk", formatStat(cap.cpk)],
      ["Pp", formatStat(cap.pp)],
      ["Ppk", formatStat(cap.ppk)],
      ["AD p-value", formatPValue(results.normalPlot.pValue)],
      ["PPM (within)", formatPpm(cap.ppmWithin)],
      ["PPM (overall)", formatPpm(cap.ppmOverall)],
      ["PPM (observed)", formatPpm(cap.ppmObserved)],
    ],
    [
      ["Index", "Value"],
      ...results.individuals.values.map((value, index) => [
        String(index + 1),
        formatStat(value),
      ]),
    ],
  ];
}

function anovaRows(analysis: StatisticalAnalysisSummary): Array<string[][]> {
  if (!isAnovaAnalysis(analysis)) return [];
  const { config, results } = analysis;
  const rows = formatRowSelection(normalizeRowSelection(config)) || "all";
  const { factor, error, total } = results.table;
  return [
    [
      ["Field", "Value"],
      ["Title", analysis.title],
      ["Response", config.responseColumnName],
      ["Factor", config.factorColumnName],
      ["Rows", rows],
      ["Kind", "One-way ANOVA"],
      ["Alpha", formatStat(results.alpha)],
      ["Created", analysis.createdAt],
    ],
    [
      ["Source", "DF", "SS", "MS", "F", "P"],
      [
        config.factorColumnName,
        String(factor.df),
        formatStat(factor.ss),
        formatStat(factor.ms),
        formatStat(factor.f),
        formatPValue(factor.p),
      ],
      [
        "Error",
        String(error.df),
        formatStat(error.ss),
        formatStat(error.ms),
        "",
        "",
      ],
      ["Total", String(total.df), formatStat(total.ss), "", "", ""],
      ["R-sq", formatStat(results.rSquared)],
      ["N", String(results.n)],
      ["Skipped", String(results.skipped)],
      ["Grand mean", formatStat(results.grandMean)],
    ],
    [
      ["Factor", "N", "Mean", "StDev", "SE", "CI low", "CI high"],
      ...results.groups.map((group) => [
        group.label,
        String(group.n),
        formatStat(group.mean),
        formatStat(group.stdev),
        formatStat(group.se),
        formatStat(group.ciLow),
        formatStat(group.ciHigh),
      ]),
    ],
    [
      [
        "Comparison",
        "Diff",
        "SE",
        "t",
        "P unadjusted",
        "P Bonferroni",
        "Significant",
      ],
      ...results.pairwise.map((pair) => [
        `${pair.groupA} - ${pair.groupB}`,
        formatStat(pair.diff),
        formatStat(pair.se),
        formatStat(pair.t),
        formatPValue(pair.pUnadjusted),
        formatPValue(pair.pBonferroni),
        pair.significant ? "yes" : "no",
      ]),
    ],
  ];
}

function scatterRows(analysis: StatisticalAnalysisSummary): Array<string[][]> {
  if (!isScatterAnalysis(analysis)) return [];
  const spec = analysis.results.specs[0];
  return [
    [
      ["Field", "Value"],
      ["Title", analysis.title],
      ["Query", analysis.config.query],
      ["Kind", "Measurement scatter"],
      ["N", String(analysis.results.n)],
      ["UOM", analysis.results.uom],
      ["LSL", formatStat(spec?.limits.lower ?? null)],
      ["USL", formatStat(spec?.limits.upper ?? null)],
      ["Created", analysis.createdAt],
    ],
    [
      ["Chart", "Series", "Label", "X", "Y", "UOM"],
      ...analysis.results.specs.flatMap((item) =>
        item.points.map((point) => [
          item.title,
          point.series ?? "",
          point.label,
          String(point.x),
          String(point.y),
          item.uom,
        ])
      ),
    ],
    [
      ["Attachment", "Page"],
      ...analysis.results.specs.flatMap((item) =>
        item.citations.map((citation) => [
          citation.attachmentId,
          String(citation.page),
        ])
      ),
    ],
  ];
}

function xyScatterRows(analysis: StatisticalAnalysisSummary): Array<string[][]> {
  if (!isXyScatterAnalysis(analysis)) return [];
  const spec = analysis.results.specs[0];
  const rows = formatRowSelection(normalizeRowSelection(analysis.config)) || "all";
  return [
    [
      ["Field", "Value"],
      ["Title", analysis.title],
      ["Y", analysis.config.yColumnName],
      ["X", analysis.config.xColumnName],
      ["Rows", rows],
      ["Kind", isObservationXyScatter(analysis.config) ? "1D scatter" : "XY scatter"],
      ["Legend", analysis.config.legendColumnName ?? ""],
      ["Chart type", CHART_MARK_LABELS[parseChartMark(analysis.config.mark ?? spec?.layout.mark)]],
      ["N", String(analysis.results.n)],
      ["Skipped", String(analysis.results.skipped)],
      ["Pearson r", formatStat(analysis.results.pearsonR, 4)],
      ["LSL (Y)", formatStat(spec?.limits.lower ?? null)],
      ["USL (Y)", formatStat(spec?.limits.upper ?? null)],
      ["Created", analysis.createdAt],
    ],
    [
      ["Chart", "Series", "Label", "X", "Y"],
      ...analysis.results.specs.flatMap((item) =>
        item.points.map((point) => [
          item.title,
          point.series ?? "",
          point.label,
          String(point.x),
          String(point.y),
        ])
      ),
    ],
  ];
}

function analysisSections(
  analysis: StatisticalAnalysisSummary
): Array<string[][]> {
  if (isScatterAnalysis(analysis)) return scatterRows(analysis);
  if (isXyScatterAnalysis(analysis)) return xyScatterRows(analysis);
  if (isAnovaAnalysis(analysis)) return anovaRows(analysis);
  if (isSixpackAnalysis(analysis)) return sixpackRows(analysis);
  const exhaustive: never = analysis;
  return exhaustive;
}

async function addAnalysisSheet(
  workbook: ExcelJS.Workbook,
  analysis: StatisticalAnalysisSummary,
  usedNames: Set<string>,
  includePlots: boolean
): Promise<void> {
  const sheet = workbook.addWorksheet(safeSheetName(analysis.title, usedNames));

  if (includePlots) {
    const plots = await plotImagesForExport(analysis);
    let nextRow = 0;
    for (const plot of plots) {
      const imageId = workbook.addImage({
        base64: plot.buffer.toString("base64"),
        extension: "png",
      });
      sheet.addImage(imageId, {
        tl: { col: 0, row: nextRow },
        ext: { width: plot.width, height: plot.height },
      });
      nextRow += excelRowsForImageHeight(plot.height);
    }
    while (sheet.rowCount < nextRow) {
      sheet.addRow([]);
    }
    if (plots.length > 0) {
      sheet.addRow([]);
    }
  }

  for (const section of analysisSections(analysis)) {
    addRows(sheet, section);
    sheet.addRow([]);
  }
}

/** Excel default row is 15pt ≈ 20px at 96dpi. `tl.row` is 0-based. */
function excelRowsForImageHeight(heightPx: number): number {
  return Math.max(4, Math.ceil(heightPx / 20) + 1);
}

export function analyticsExportFilename(documentNo: string | null): string {
  const base = (documentNo?.trim() || "report")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "report"}-analytics.xlsx`;
}

export async function buildAnalyticsXlsx(
  analytics: ReportAnalyticsView,
  options: BuildAnalyticsXlsxOptions = {}
): Promise<Uint8Array> {
  const includePlots = options.includePlots ?? false;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Andrei";
  workbook.created = new Date();

  const usedNames = new Set<string>();
  for (const sheetData of analytics.worksheet.sheets) {
    addWorksheetSheet(workbook, sheetData, usedNames);
  }
  addSpecsSheet(workbook, analytics.worksheet, usedNames);

  for (const analysis of analytics.analyses) {
    await addAnalysisSheet(workbook, analysis, usedNames, includePlots);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(arrayBuffer);
}
