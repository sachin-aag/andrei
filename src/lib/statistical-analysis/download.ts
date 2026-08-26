import { formatPValue, formatPpm, formatStat } from "./format";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "./row-selection";
import type { StatisticalAnalysisSummary } from "./types";

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(",");
}

export function analysisDownloadFilename(
  analysis: StatisticalAnalysisSummary
): string {
  const base =
    analysis.title
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "sixpack";
  return `${base}-capability-sixpack.csv`;
}

export function analysisToCsv(analysis: StatisticalAnalysisSummary): string {
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
