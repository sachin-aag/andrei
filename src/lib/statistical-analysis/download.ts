import { formatPValue, formatPpm, formatStat } from "./format";
import {
  CHART_MARK_LABELS,
  parseChartMark,
} from "@/lib/charts/chart-marks";
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
  type AnovaAnalysisSummary,
  type BoxplotAnalysisSummary,
  type HistogramAnalysisSummary,
  type StatisticalAnalysisSummary,
  type XyScatterAnalysisSummary,
} from "./types";

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(",");
}

function safeFilenameBase(title: string, fallback: string): string {
  return (
    title
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

export function analysisDownloadFilename(
  analysis: StatisticalAnalysisSummary
): string {
  if (isScatterAnalysis(analysis)) {
    return `${safeFilenameBase(analysis.title, "scatter")}-measurement-scatter.csv`;
  }
  if (isXyScatterAnalysis(analysis)) {
    return `${safeFilenameBase(analysis.title, "scatter")}-xy-scatter.csv`;
  }
  if (isAnovaAnalysis(analysis)) {
    return `${safeFilenameBase(analysis.title, "anova")}-one-way-anova.csv`;
  }
  if (isBoxplotAnalysis(analysis)) {
    return `${safeFilenameBase(analysis.title, "boxplot")}-boxplot.csv`;
  }
  if (isHistogramAnalysis(analysis)) {
    return `${safeFilenameBase(analysis.title, "histogram")}-histogram.csv`;
  }
  if (!isSixpackAnalysis(analysis)) {
    const exhaustive: never = analysis;
    return exhaustive;
  }
  return `${safeFilenameBase(analysis.title, "sixpack")}-capability-sixpack.csv`;
}

export function analysisImageDownloadFilename(
  analysis: StatisticalAnalysisSummary
): string {
  return analysisDownloadFilename(analysis).replace(/\.csv$/i, ".png");
}

export function analysisToCsv(analysis: StatisticalAnalysisSummary): string {
  if (isScatterAnalysis(analysis)) {
    return scatterToCsv(analysis);
  }
  if (isXyScatterAnalysis(analysis)) {
    return xyScatterToCsv(analysis);
  }
  if (isAnovaAnalysis(analysis)) {
    return anovaToCsv(analysis);
  }
  if (isBoxplotAnalysis(analysis)) {
    return boxplotToCsv(analysis);
  }
  if (isHistogramAnalysis(analysis)) {
    return histogramToCsv(analysis);
  }
  if (!isSixpackAnalysis(analysis)) {
    const exhaustive: never = analysis;
    return exhaustive;
  }
  const { config, results } = analysis;
  const rows = formatRowSelection(normalizeRowSelection(config)) || "all";
  const cap = results.capability;
  const summary: Array<[string, string]> = [
    ["Title", analysis.title],
    ["Column", config.columnName],
    ["Rows", rows],
    ["Kind", "Normal Capability Sixpack (I-MR)"],
    ["LSL", formatStat(config.lsl)],
    ["Target", formatStat(config.target)],
    ["USL", formatStat(config.usl)],
    ["Created", analysis.createdAt],
  ];
  const stats: Array<[string, string]> = [
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
  ];

  const lines = [
    "Summary",
    csvRow(["Field", "Value"]),
    ...summary.map(([field, value]) => csvRow([field, value])),
    "",
    "Capability",
    csvRow(["Metric", "Value"]),
    ...stats.map(([field, value]) => csvRow([field, value])),
    "",
    "Observations",
    csvRow(["Index", "Value"]),
    ...results.individuals.values.map((value, index) =>
      csvRow([String(index + 1), formatStat(value)])
    ),
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

function csvNumber(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return "Inf";
  if (value === Number.NEGATIVE_INFINITY) return "-Inf";
  return formatStat(value);
}

function anovaToCsv(analysis: AnovaAnalysisSummary): string {
  const { config, results } = analysis;
  const rows = formatRowSelection(normalizeRowSelection(config)) || "all";
  const { factor, error, total } = results.table;
  const summary: Array<[string, string]> = [
    ["Title", analysis.title],
    ["Response", config.responseColumnName],
    ["Factor", config.factorColumnName],
    ["Rows", rows],
    ["Kind", "One-way ANOVA"],
    ["Alpha", formatStat(results.alpha)],
    ["Created", analysis.createdAt],
  ];
  const tableRows = [
    csvRow([
      config.factorColumnName,
      String(factor.df),
      csvNumber(factor.ss),
      csvNumber(factor.ms),
      csvNumber(factor.f),
      formatPValue(factor.p),
    ]),
    csvRow([
      "Error",
      String(error.df),
      csvNumber(error.ss),
      csvNumber(error.ms),
      "",
      "",
    ]),
    csvRow(["Total", String(total.df), csvNumber(total.ss), "", "", ""]),
  ];
  const groupRows = results.groups.map((group) =>
    csvRow([
      group.label,
      String(group.n),
      csvNumber(group.mean),
      csvNumber(group.stdev),
      csvNumber(group.se),
      csvNumber(group.ciLow),
      csvNumber(group.ciHigh),
    ])
  );
  const pairRows = results.pairwise.map((pair) =>
    csvRow([
      `${pair.groupA} - ${pair.groupB}`,
      csvNumber(pair.diff),
      csvNumber(pair.se),
      csvNumber(pair.t),
      formatPValue(pair.pUnadjusted),
      formatPValue(pair.pBonferroni),
      pair.significant ? "yes" : "no",
    ])
  );
  const lines = [
    "Summary",
    csvRow(["Field", "Value"]),
    ...summary.map(([field, value]) => csvRow([field, value])),
    "",
    "ANOVA",
    csvRow(["Source", "DF", "SS", "MS", "F", "P"]),
    ...tableRows,
    csvRow(["R-sq", formatStat(results.rSquared)]),
    csvRow(["N", String(results.n)]),
    csvRow(["Skipped", String(results.skipped)]),
    csvRow(["Grand mean", csvNumber(results.grandMean)]),
    "",
    "Group means",
    csvRow(["Factor", "N", "Mean", "StDev", "SE", "CI low", "CI high"]),
    ...groupRows,
    "",
    "Pairwise (Bonferroni t-tests using ANOVA MSE)",
    csvRow([
      "Comparison",
      "Diff",
      "SE",
      "t",
      "P unadjusted",
      "P Bonferroni",
      "Significant",
    ]),
    ...pairRows,
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

function boxplotToCsv(analysis: BoxplotAnalysisSummary): string {
  const { config, results } = analysis;
  const rows = formatRowSelection(normalizeRowSelection(config)) || "all";
  const categoryHeaders =
    config.categoryColumnNames.length > 0
      ? config.categoryColumnNames
      : ["Group"];
  const summary: Array<[string, string]> = [
    ["Title", analysis.title],
    ["Y", config.yColumnName],
    ["Categories", config.categoryColumnNames.join(", ") || "(none)"],
    ["Rows", rows],
    ["Kind", "Boxplot (Tukey)"],
    ["N", String(results.n)],
    ["Skipped", String(results.skipped)],
    ["Created", analysis.createdAt],
  ];
  const groupRows = results.groups.map((group) =>
    csvRow([
      ...(group.labels.length > 0 ? group.labels : ["All"]),
      String(group.n),
      csvNumber(group.min),
      csvNumber(group.q1),
      csvNumber(group.median),
      csvNumber(group.q3),
      csvNumber(group.max),
      csvNumber(group.whiskerLow),
      csvNumber(group.whiskerHigh),
      String(group.outliers.length),
    ])
  );
  const lines = [
    "Summary",
    csvRow(["Field", "Value"]),
    ...summary.map(([field, value]) => csvRow([field, value])),
    "",
    "Groups",
    csvRow([
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
    ]),
    ...groupRows,
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

function histogramToCsv(analysis: HistogramAnalysisSummary): string {
  const { config, results } = analysis;
  const rows = formatRowSelection(normalizeRowSelection(config)) || "all";
  const summary: Array<[string, string]> = [
    ["Title", analysis.title],
    ["Column", config.columnName],
    ["Rows", rows],
    ["Kind", "Histogram"],
    ["N", String(results.n)],
    ["Skipped", String(results.skipped)],
    ["Mean", csvNumber(results.mean)],
    ["Overall StDev", csvNumber(results.overallStdev)],
    ["Within StDev", csvNumber(results.withinStdev)],
    ["LSL", config.lsl == null ? "" : csvNumber(config.lsl)],
    ["USL", config.usl == null ? "" : csvNumber(config.usl)],
    ["Show distribution lines", config.showDistributionLines === false ? "No" : "Yes"],
    ["Show LSL", config.showLsl === false ? "No" : "Yes"],
    ["Show USL", config.showUsl === false ? "No" : "Yes"],
    ["Created", analysis.createdAt],
  ];
  const binRows = results.histogram.bins.map((bin) =>
    csvRow([csvNumber(bin.x0), csvNumber(bin.x1), String(bin.count)])
  );
  const lines = [
    "Summary",
    csvRow(["Field", "Value"]),
    ...summary.map(([field, value]) => csvRow([field, value])),
    "",
    "Bins",
    csvRow(["x0", "x1", "Count"]),
    ...binRows,
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

function scatterToCsv(
  analysis: Extract<StatisticalAnalysisSummary, { kind: "measurement_scatter" }>
): string {
  const spec = analysis.results.specs[0];
  const summary: Array<[string, string]> = [
    ["Title", analysis.title],
    ["Query", analysis.config.query],
    ["Kind", "Measurement scatter"],
    ["N", String(analysis.results.n)],
    ["UOM", analysis.results.uom],
    ["LSL", formatStat(spec?.limits.lower ?? null)],
    ["USL", formatStat(spec?.limits.upper ?? null)],
    ["Created", analysis.createdAt],
  ];
  const pointRows = analysis.results.specs.flatMap((item) =>
    item.points.map((point) =>
      csvRow([
        item.title,
        point.series ?? "",
        point.label,
        String(point.x),
        String(point.y),
        item.uom,
      ])
    )
  );
  const citationRows = analysis.results.specs.flatMap((item) =>
    item.citations.map((citation) =>
      csvRow([citation.attachmentId, String(citation.page)])
    )
  );
  const lines = [
    "Summary",
    csvRow(["Field", "Value"]),
    ...summary.map(([field, value]) => csvRow([field, value])),
    "",
    "Points",
    csvRow(["Chart", "Series", "Label", "X", "Y", "UOM"]),
    ...pointRows,
    "",
    "Citations",
    csvRow(["Attachment", "Page"]),
    ...citationRows,
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

function xyScatterToCsv(analysis: XyScatterAnalysisSummary): string {
  const spec = analysis.results.specs[0];
  const rows = formatRowSelection(normalizeRowSelection(analysis.config)) || "all";
  const summary: Array<[string, string]> = [
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
  ];
  const pointRows = analysis.results.specs.flatMap((item) =>
    item.points.map((point) =>
      csvRow([
        item.title,
        point.series ?? "",
        point.label,
        String(point.x),
        String(point.y),
      ])
    )
  );
  const citationRows = analysis.results.specs.flatMap((item) =>
    item.citations.map((citation) =>
      csvRow([citation.attachmentId, String(citation.page)])
    )
  );
  const lines = [
    "Summary",
    csvRow(["Field", "Value"]),
    ...summary.map(([field, value]) => csvRow([field, value])),
    "",
    "Points",
    csvRow(["Chart", "Series", "Label", "X", "Y"]),
    ...pointRows,
    "",
    "Citations",
    csvRow(["Attachment", "Page"]),
    ...citationRows,
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

export function downloadTextFile(
  filename: string,
  contents: string,
  mime = "text/csv;charset=utf-8"
): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

/** Plot analyses download the captured PNG; tables stay CSV. */
export function downloadAnalysis(analysis: StatisticalAnalysisSummary): void {
  const preview = analysis.previewImage;
  if (preview?.dataUrl) {
    downloadDataUrl(analysisImageDownloadFilename(analysis), preview.dataUrl);
    return;
  }
  downloadTextFile(analysisDownloadFilename(analysis), analysisToCsv(analysis));
}
