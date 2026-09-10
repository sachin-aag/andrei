import ExcelJS from "exceljs";
import { CHART_MARK_LABELS, parseChartMark } from "@/lib/charts/chart-marks";
import {
  uniqueChartCitations,
  type ChartCitation,
} from "@/lib/charts/chart-spec";
import {
  buildAnalysisChartSource,
  chartAnchor,
  chartSlotRows,
  CHARTS_PER_ROW,
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

/** A number plus the display format the app uses for it. */
type NumericSheetCell = { value: number; numFmt: string };
type SheetCell = string | number | null | undefined | NumericSheetCell;
type SheetSection = SheetCell[][];

function isNumericSheetCell(cell: SheetCell): cell is NumericSheetCell {
  return typeof cell === "object" && cell != null && "numFmt" in cell;
}

/**
 * Store the number, display it exactly as the app formats it. Renderings that
 * are not a plain decimal (`*`, `<0.001`, exponential) stay text.
 */
function numericCell(
  value: number | null | undefined,
  text: string
): SheetCell {
  if (value == null || !Number.isFinite(value)) return text;
  const match = /^-?\d+(?:\.(\d+))?$/.exec(text);
  if (!match) return text;
  const decimals = match[1]?.length ?? 0;
  return { value, numFmt: decimals > 0 ? `0.${"0".repeat(decimals)}` : "0" };
}

function statCell(value: number | null | undefined, digits = 4): SheetCell {
  return numericCell(value, formatStat(value, digits));
}

function ppmCell(value: number | null | undefined): SheetCell {
  return numericCell(value, formatPpm(value));
}

function pValueCell(value: number | null | undefined): SheetCell {
  return numericCell(value, formatPValue(value));
}

/**
 * Worksheet values are stored as raw text (`WorksheetColumn.values`). Export a
 * number only when the text round-trips exactly, so `0012`, `1-2` and `1.50`
 * stay text and lot codes survive.
 */
export function worksheetCellValue(raw: string): string | number {
  const trimmed = raw.trim();
  if (trimmed === "") return raw;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return raw;
  return String(parsed) === trimmed ? parsed : raw;
}

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
    const added = sheet.addRow(
      row.map((cell) => (isNumericSheetCell(cell) ? cell.value : (cell ?? "")))
    );
    for (const [index, cell] of row.entries()) {
      if (isNumericSheetCell(cell)) {
        added.getCell(index + 1).numFmt = cell.numFmt;
      }
    }
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
      sheetData.columns.map((column) =>
        worksheetCellValue(column.values[row] ?? "")
      )
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
    sheet.addRow([
      spec.columnName,
      worksheetCellValue(spec.lsl),
      worksheetCellValue(spec.usl),
      worksheetCellValue(spec.target),
    ]);
  }
}

/**
 * The sixpack's sixth panel. Laid out as two label/value columns so the sheet
 * reads like the app's grid instead of a stack of metric rows.
 */
function sixpackCapabilityBlock(
  analysis: StatisticalAnalysisSummary
): SheetSection | null {
  if (!isSixpackAnalysis(analysis)) return null;
  const { results } = analysis;
  const cap = results.capability;
  const left: Array<[string, SheetCell]> = [
    ["Sample N", results.n],
    ...(results.skipped > 0
      ? ([["Skipped", results.skipped]] as Array<[string, SheetCell]>)
      : []),
    ["Mean", statCell(results.mean, 3)],
    ["StDev (overall)", statCell(results.overallStdev, 3)],
    ["StDev (within)", statCell(results.withinStdev, 3)],
    ["MR-bar", statCell(results.mrBar, 3)],
    ["LSL", statCell(cap.lsl, 3)],
    ["Target", statCell(cap.target, 3)],
    ["USL", statCell(cap.usl, 3)],
    ["AD p-value", pValueCell(results.normalPlot.pValue)],
  ];
  const right: Array<[string, SheetCell]> = [
    ["Cp", statCell(cap.cp, 3)],
    ["CPL", statCell(cap.cpl, 3)],
    ["CPU", statCell(cap.cpu, 3)],
    ["Cpk", statCell(cap.cpk, 3)],
    ["PPM (exp.)", ppmCell(cap.ppmWithin)],
    ["", ""],
    ["OVERALL", ""],
    ["Pp", statCell(cap.pp, 3)],
    ["PPL", statCell(cap.ppl, 3)],
    ["PPU", statCell(cap.ppu, 3)],
    ["Ppk", statCell(cap.ppk, 3)],
    ["PPM (exp.)", ppmCell(cap.ppmOverall)],
    ["PPM (obs.)", ppmCell(cap.ppmObserved)],
  ];
  const rows: SheetSection = [
    ["Process Capability", "", "", ""],
    ["PROCESS DATA", "", "POTENTIAL (WITHIN)", ""],
  ];
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    rows.push([
      left[i]?.[0] ?? "",
      left[i]?.[1] ?? "",
      right[i]?.[0] ?? "",
      right[i]?.[1] ?? "",
    ]);
  }
  return rows;
}

/** Write a block at a fixed anchor — used for the panel that has no chart. */
function writeBlockAt(
  sheet: ExcelJS.Worksheet,
  rows: SheetSection,
  anchorRow: number,
  anchorCol: number
): void {
  for (const [rowIndex, row] of rows.entries()) {
    for (const [colIndex, value] of row.entries()) {
      const cell = sheet.getCell(anchorRow + rowIndex + 1, anchorCol + colIndex + 1);
      if (isNumericSheetCell(value)) {
        cell.value = value.value;
        cell.numFmt = value.numFmt;
      } else {
        cell.value = value ?? "";
      }
      if (rowIndex === 0) cell.font = { bold: true, size: 12 };
      else if (rowIndex === 1) cell.font = { bold: true, size: 9 };
      else if (String(value) === "OVERALL") cell.font = { bold: true, size: 9 };
    }
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
      ["LSL", statCell(config.lsl)],
      ["Target", statCell(config.target)],
      ["USL", statCell(config.usl)],
      ["Created", analysis.createdAt],
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
      ["Alpha", statCell(results.alpha)],
      ["Created", analysis.createdAt],
    ],
    [
      ["Source", "DF", "SS", "MS", "F", "P"],
      [
        config.factorColumnName,
        factor.df,
        statCell(factor.ss),
        statCell(factor.ms),
        statCell(factor.f),
        pValueCell(factor.p),
      ],
      ["Error", error.df, statCell(error.ss), statCell(error.ms), "", ""],
      ["Total", total.df, statCell(total.ss), "", "", ""],
      ["R-sq", statCell(results.rSquared)],
      ["N", results.n],
      ["Skipped", results.skipped],
      ["Grand mean", statCell(results.grandMean)],
    ],
    [
      ["Factor", "N", "Mean", "StDev", "SE", "CI low", "CI high"],
      ...results.groups.map((group) => [
        group.label,
        group.n,
        statCell(group.mean),
        statCell(group.stdev),
        statCell(group.se),
        statCell(group.ciLow),
        statCell(group.ciHigh),
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
        statCell(pair.diff),
        statCell(pair.se),
        statCell(pair.t),
        pValueCell(pair.pUnadjusted),
        pValueCell(pair.pBonferroni),
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
      ["N", analysis.results.n],
      ["UOM", analysis.results.uom],
      ["LSL", statCell(spec?.limits.lower ?? null)],
      ["USL", statCell(spec?.limits.upper ?? null)],
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
      ["N", analysis.results.n],
      ["Skipped", analysis.results.skipped],
      ["Pearson r", statCell(analysis.results.pearsonR, 4)],
      ["LSL (Y)", statCell(spec?.limits.lower ?? null)],
      ["USL (Y)", statCell(spec?.limits.upper ?? null)],
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
      ["N", results.n],
      ["Skipped", results.skipped],
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
      ["N", results.n],
      ["Skipped", results.skipped],
      ["Mean", statCell(results.mean)],
      ["Overall StDev", statCell(results.overallStdev)],
      ["Within StDev", statCell(results.withinStdev)],
      ["LSL", config.lsl == null ? "" : statCell(config.lsl)],
      ["USL", config.usl == null ? "" : statCell(config.usl)],
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

  // The sixpack's stats panel has no chart; drop it into the empty grid slot.
  const block = sixpackCapabilityBlock(analysis);
  const blockSlot = source.charts.length;
  const blockFits =
    block != null && blockSlot > 0 && blockSlot % CHARTS_PER_ROW !== 0;
  if (block && blockFits) {
    const anchor = chartAnchor(blockSlot, source.charts.length);
    writeBlockAt(sheet, block, anchor.anchorRow, anchor.anchorCol);
  }

  for (const section of sections) {
    addRows(sheet, section);
    sheet.addRow([]);
  }
  if (block && !blockFits) {
    addRows(sheet, block);
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
