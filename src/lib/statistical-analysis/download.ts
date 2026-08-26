import { formatPValue, formatPpm, formatStat } from "./format";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "./row-selection";
import {
  isScatterAnalysis,
  isSixpackAnalysis,
  type StatisticalAnalysisSummary,
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
  return `${safeFilenameBase(analysis.title, "sixpack")}-capability-sixpack.csv`;
}

export function analysisToCsv(analysis: StatisticalAnalysisSummary): string {
  if (isScatterAnalysis(analysis)) {
    return scatterToCsv(analysis);
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
