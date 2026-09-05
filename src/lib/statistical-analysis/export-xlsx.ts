import ExcelJS from "exceljs";
import { CHART_MARK_LABELS, parseChartMark } from "@/lib/charts/chart-marks";
import {
  uniqueChartCitations,
  type ChartCitation,
} from "@/lib/charts/chart-spec";
import {
  buildAnalysisChartSource,
  chartSlotRows,
  resolvePlannedCharts,
  type WrittenChartTable,
} from "./excel-chart-source";
import {
  injectExcelCharts,
  type SheetChartPlan,
} from "./excel-chart-xml";
import { formatPValue, formatPpm, formatStat } from "./format";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "./row-selection";
import {
  isAnovaAnalysis,
  isBoxplotAnalysis,
  isHistogramAnalysis,
  isObservationXyScatter,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type ReportAnalyticsView,
  type StatisticalAnalysisSummary,
  type WorksheetColumn,
  type WorksheetData,
  type WorksheetSheet,
} from "./types";

export type BuildAnalyticsXlsxOptions = {
  includePlots?: boolean;
};

const INVALID_SHEET_CHARS = /[*?:/\\[\]]/g;
const BANNER_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };
const BANNER_ROW_HEIGHT = 22;

/** Page range when known; otherwise retain the source document name. */
export function formatWorksheetSourceLine(
  citations: readonly ChartCitation[]
): string | null {
  const unique = uniqueChartCitations(citations);
  if (unique.length === 0) return null;
  const pages = unique.flatMap((citation) =>
    citation.page == null ? [] : [citation.page]
  );
  if (pages.length > 0) {
    const min = Math.min(...pages);
    const max = Math.max(...pages);
    const range = min === max ? String(min) : `${min}-${max}`;
    return `Source : Attachment on pg (${range})`;
  }
  const filenames = [
    ...new Set(
      unique.flatMap((citation) =>
        citation.filename?.trim() ? [citation.filename.trim()] : []
      )
    ),
  ];
  return `Source : ${filenames.join(", ") || "Attachment"}`;
}

function bannerLastColIndex(columnCount: number): number {
  return Math.max(columnCount, 2) - 1;
}

function addBannerRow(
  sheet: ExcelJS.Worksheet,
  options: { title: string; source: string | null; lastColIndex: number }
): void {
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = options.title;
  titleCell.font = BANNER_FONT;
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  if (options.source) {
    const sourceCol = options.lastColIndex + 1;
    if (sourceCol > 1) {
      sheet.mergeCells(1, 1, 1, sourceCol - 1);
    }
    const sourceCell = sheet.getCell(1, sourceCol);
    sourceCell.value = options.source;
    sourceCell.font = BANNER_FONT;
    sourceCell.alignment = { vertical: "middle", horizontal: "right" };
  }

  sheet.getRow(1).height = BANNER_ROW_HEIGHT;
}

function citationsFromColumns(
  columns: readonly WorksheetColumn[],
  columnIds?: readonly string[]
): ChartCitation[] {
  const wanted = columnIds ? new Set(columnIds) : null;
  const collected: ChartCitation[] = [];
  for (const column of columns) {
    if (wanted && !wanted.has(column.id)) continue;
    if (column.citations) collected.push(...column.citations);
  }
  return uniqueChartCitations(collected);
}

function pushColumnId(ids: string[], id: string | null | undefined): void {
  const trimmed = id?.trim();
  if (trimmed) ids.push(trimmed);
}

function columnIdsForAnalysis(analysis: StatisticalAnalysisSummary): string[] {
  const ids: string[] = [];
  if (isSixpackAnalysis(analysis) || isHistogramAnalysis(analysis)) {
    pushColumnId(ids, analysis.config.columnId);
    return ids;
  }
  if (isAnovaAnalysis(analysis)) {
    pushColumnId(ids, analysis.config.responseColumnId);
    pushColumnId(ids, analysis.config.factorColumnId);
    return ids;
  }
  if (isBoxplotAnalysis(analysis)) {
    pushColumnId(ids, analysis.config.yColumnId);
    for (const columnId of analysis.config.categoryColumnIds) {
      pushColumnId(ids, columnId);
    }
    return ids;
  }
  if (isXyScatterAnalysis(analysis)) {
    pushColumnId(ids, analysis.config.yColumnId);
    pushColumnId(ids, analysis.config.xColumnId);
    pushColumnId(ids, analysis.config.legendColumnId);
    return ids;
  }
  if (isScatterAnalysis(analysis)) {
    return ids;
  }
  const exhaustive: never = analysis;
  return exhaustive;
}

function citationsFromScatterSpecs(
  analysis: StatisticalAnalysisSummary
): ChartCitation[] {
  if (!isScatterAnalysis(analysis) && !isXyScatterAnalysis(analysis)) {
    return [];
  }
  return uniqueChartCitations(
    analysis.results.specs.flatMap((spec) => spec.citations)
  );
}

function citationsForAnalysis(
  analysis: StatisticalAnalysisSummary,
  columns: readonly WorksheetColumn[]
): ChartCitation[] {
  return uniqueChartCitations([
    ...citationsFromColumns(columns, columnIdsForAnalysis(analysis)),
    ...citationsFromScatterSpecs(analysis),
  ]);
}

type SheetCell = string | number | null | undefined;
type SheetSection = SheetCell[][];

function maxSectionColumnCount(sections: SheetSection[]): number {
  let max = 2;
  for (const section of sections) {
    for (const row of section) {
      if (row.length > max) max = row.length;
    }
  }
  return max;
}

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
  rows: SheetSection
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
  addBannerRow(sheet, {
    title: sheetData.name,
    source: formatWorksheetSourceLine(citationsFromColumns(sheetData.columns)),
    lastColIndex: bannerLastColIndex(sheetData.columns.length),
  });
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
  columns: readonly WorksheetColumn[],
  usedNames: Set<string>
): void {
  if (worksheet.specs.length === 0) return;
  const sheet = workbook.addWorksheet(safeSheetName("Specs", usedNames));
  addBannerRow(sheet, {
    title: "Specs",
    source: formatWorksheetSourceLine(citationsFromColumns(columns)),
    lastColIndex: bannerLastColIndex(4),
  });
  sheet.addRow(["Column", "LSL", "USL", "Target"]);
  for (const spec of worksheet.specs) {
    sheet.addRow([spec.columnName, spec.lsl, spec.usl, spec.target]);
  }
}

function sixpackRows(analysis: StatisticalAnalysisSummary): SheetSection[] {
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
        index + 1,
        value,
      ]),
    ],
  ];
}

function anovaRows(analysis: StatisticalAnalysisSummary): SheetSection[] {
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

function scatterRows(analysis: StatisticalAnalysisSummary): SheetSection[] {
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
          point.x,
          point.y,
          item.uom,
        ])
      ),
    ],
    [
      ["Attachment", "Page"],
      ...analysis.results.specs.flatMap((item) =>
        item.citations.map((citation) => [
          citation.filename ?? citation.attachmentId,
          citation.page == null ? "" : String(citation.page),
        ])
      ),
    ],
  ];
}

function xyScatterRows(analysis: StatisticalAnalysisSummary): SheetSection[] {
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
          point.x,
          point.y,
        ])
      ),
    ],
    [
      ["Attachment", "Page"],
      ...analysis.results.specs.flatMap((item) =>
        item.citations.map((citation) => [
          citation.filename ?? citation.attachmentId,
          citation.page == null ? "" : String(citation.page),
        ])
      ),
    ],
  ];
}

function boxplotRows(analysis: StatisticalAnalysisSummary): SheetSection[] {
  if (!isBoxplotAnalysis(analysis)) return [];
  const { config, results } = analysis;
  const rows = formatRowSelection(normalizeRowSelection(config)) || "all";
  const categoryHeaders =
    config.categoryColumnNames.length > 0
      ? config.categoryColumnNames
      : ["Group"];
  return [
    [
      ["Field", "Value"],
      ["Title", analysis.title],
      ["Y", config.yColumnName],
      ["Categories", config.categoryColumnNames.join(", ") || "(none)"],
      ["Rows", rows],
      ["Kind", "Boxplot (Tukey)"],
      ["N", String(results.n)],
      ["Skipped", String(results.skipped)],
      ["Created", analysis.createdAt],
    ],
    [
      [
        ...categoryHeaders,
        "N",
        "Min",
        "Q1",
        "Median",
        "Q3",
        "Max",
        "Whisker low",
        "Whisker high",
        "Outliers",
      ],
      ...results.groups.map((group) => [
        ...(group.labels.length > 0 ? group.labels : ["All"]),
        group.n,
        group.min,
        group.q1,
        group.median,
        group.q3,
        group.max,
        group.whiskerLow,
        group.whiskerHigh,
        group.outliers.length,
      ]),
    ],
  ];
}

function histogramRows(analysis: StatisticalAnalysisSummary): SheetSection[] {
  if (!isHistogramAnalysis(analysis)) return [];
  const { config, results } = analysis;
  const rows = formatRowSelection(normalizeRowSelection(config)) || "all";
  return [
    [
      ["Field", "Value"],
      ["Title", analysis.title],
      ["Column", config.columnName],
      ["Rows", rows],
      ["Kind", "Histogram"],
      ["N", String(results.n)],
      ["Skipped", String(results.skipped)],
      ["Mean", formatStat(results.mean)],
      ["Overall StDev", formatStat(results.overallStdev)],
      ["Within StDev", formatStat(results.withinStdev)],
      ["LSL", config.lsl == null ? "" : formatStat(config.lsl)],
      ["USL", config.usl == null ? "" : formatStat(config.usl)],
      [
        "Show distribution lines",
        config.showDistributionLines === false ? "No" : "Yes",
      ],
      ["Show LSL", config.showLsl === false ? "No" : "Yes"],
      ["Show USL", config.showUsl === false ? "No" : "Yes"],
      ["Created", analysis.createdAt],
    ],
    [
      ["x0", "x1", "Count"],
      ...results.histogram.bins.map((bin) => [
        bin.x0,
        bin.x1,
        bin.count,
      ]),
    ],
  ];
}

function analysisSections(
  analysis: StatisticalAnalysisSummary
): SheetSection[] {
  if (isScatterAnalysis(analysis)) return scatterRows(analysis);
  if (isXyScatterAnalysis(analysis)) return xyScatterRows(analysis);
  if (isAnovaAnalysis(analysis)) return anovaRows(analysis);
  if (isBoxplotAnalysis(analysis)) return boxplotRows(analysis);
  if (isHistogramAnalysis(analysis)) return histogramRows(analysis);
  if (isSixpackAnalysis(analysis)) return sixpackRows(analysis);
  const exhaustive: never = analysis;
  return exhaustive;
}

function writeChartSourceTables(
  sheet: ExcelJS.Worksheet,
  tables: Array<{
    id: string;
    title: string;
    headers: string[];
    rows: Array<Array<string | number | null>>;
  }>
): Map<string, WrittenChartTable> {
  const written = new Map<string, WrittenChartTable>();
  for (const table of tables) {
    const titleRow = sheet.addRow([table.title]);
    titleRow.getCell(1).font = { bold: true };
    const headerRow = sheet.addRow(table.headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
    });
    const dataStart = headerRow.number + 1;
    for (const row of table.rows) {
      sheet.addRow(row.map((cell) => (cell == null ? null : cell)));
    }
    const dataEnd =
      table.rows.length === 0 ? headerRow.number : dataStart + table.rows.length - 1;
    written.set(table.id, {
      dataStart,
      dataEnd,
      headers: table.headers,
      rows: table.rows,
    });
    sheet.addRow([]);
  }
  return written;
}

function addAnalysisSheet(
  workbook: ExcelJS.Workbook,
  analysis: StatisticalAnalysisSummary,
  columns: readonly WorksheetColumn[],
  usedNames: Set<string>,
  includePlots: boolean
): SheetChartPlan | null {
  const sheet = workbook.addWorksheet(safeSheetName(analysis.title, usedNames));
  const sections = analysisSections(analysis);
  const source = includePlots
    ? buildAnalysisChartSource(analysis)
    : { tables: [], charts: [] };
  const tableWidth = Math.max(
    2,
    ...source.tables.map((table) => table.headers.length)
  );
  addBannerRow(sheet, {
    title: analysis.title,
    source: formatWorksheetSourceLine(citationsForAnalysis(analysis, columns)),
    lastColIndex: bannerLastColIndex(
      Math.max(maxSectionColumnCount(sections), tableWidth)
    ),
  });

  const slot = chartSlotRows(source.charts.length);
  for (let i = 0; i < slot; i += 1) {
    sheet.addRow([]);
  }

  let plan: SheetChartPlan | null = null;
  if (source.charts.length > 0) {
    const written = writeChartSourceTables(sheet, source.tables);
    const charts = resolvePlannedCharts(sheet.name, source.charts, written);
    if (charts.length > 0) {
      plan = { sheetName: sheet.name, charts };
    }
  }

  for (const section of sections) {
    addRows(sheet, section);
    sheet.addRow([]);
  }
  return plan;
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
  const columns = analytics.worksheet.sheets.flatMap((sheet) => sheet.columns);
  for (const sheetData of analytics.worksheet.sheets) {
    addWorksheetSheet(workbook, sheetData, usedNames);
  }
  addSpecsSheet(workbook, analytics.worksheet, columns, usedNames);

  const chartPlans: SheetChartPlan[] = [];
  for (const analysis of analytics.analyses) {
    const plan = addAnalysisSheet(
      workbook,
      analysis,
      columns,
      usedNames,
      includePlots
    );
    if (plan) chartPlans.push(plan);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (!includePlots) return bytes;
  return injectExcelCharts(bytes, chartPlans);
}
