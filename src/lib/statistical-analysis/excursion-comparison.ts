import {
  isTimeSeriesAnalysis,
  type StatisticalAnalysisSummary,
  type TimeSeriesAnalysisSummary,
} from "./types";

/**
 * Every out-of-band run across every saved time series on a report, as one
 * comparable list.
 *
 * An investigation into a repeated event has to put this batch beside its
 * history — eight cycle prints, ~530 pages, one table. Walking those pages is
 * not an option: comprehensive review caps at `REVIEW_INVENTORY_WALK_CAP` (48)
 * pages, and even if it did not, counting excursions by eye across 15,900
 * readings is exactly the step that produced the wrong numbers in ERF/26/022.
 *
 * Once each batch has a saved time series, the comparison is a table build
 * over computed results. Every number here is analysis-backed, so it survives
 * the grounding gate (see `analysis-evidence.ts`) and cites both the analysis
 * and the pages its rows came from.
 */

export type ExcursionComparisonRow = {
  analysisId: string;
  /** The saved analysis title — normally the batch or equipment it covers. */
  series: string;
  start: string;
  end: string;
  readings: number;
  elapsedMinutes: number | null;
  direction: "low" | "high" | "mixed";
  min: number;
  max: number;
  /** The band in force, when the spec was conditional. */
  condition: string | null;
  lsl: number | null;
  usl: number | null;
};

export type ExcursionComparison = {
  rows: ExcursionComparisonRow[];
  /** Series that were analysed and had no excursion — a finding in itself. */
  clean: Array<{ analysisId: string; series: string; n: number }>;
};

export function buildExcursionComparison(
  analyses: readonly StatisticalAnalysisSummary[]
): ExcursionComparison {
  const series = analyses.filter(isTimeSeriesAnalysis);
  const rows: ExcursionComparisonRow[] = [];
  const clean: ExcursionComparison["clean"] = [];

  for (const analysis of series) {
    if (analysis.results.excursions.length === 0) {
      // "No excursion in this cycle" is as much a result as a run, and a
      // comparison that only lists failures reads as if nothing was checked.
      clean.push({
        analysisId: analysis.id,
        series: analysis.title,
        n: analysis.results.n,
      });
      continue;
    }
    for (const run of analysis.results.excursions) {
      rows.push({
        analysisId: analysis.id,
        series: analysis.title,
        start: run.startLabel,
        end: run.endLabel,
        readings: run.readings,
        elapsedMinutes: run.elapsedMinutes,
        direction: run.direction,
        min: run.min,
        max: run.max,
        condition: run.condition,
        lsl: run.lsl,
        usl: run.usl,
      });
    }
  }

  // Oldest first: a history table reads forward to the event under
  // investigation, not backward from it.
  rows.sort((a, b) => a.start.localeCompare(b.start));
  return { rows, clean };
}

/** One line per saved time series for the chat context map. */
export function summarizeTimeSeriesForPrompt(
  analysis: TimeSeriesAnalysisSummary
): string {
  const { results, config } = analysis;
  if (results.excursions.length === 0) {
    return `${results.n} readings of ${config.columnName}, no excursion`;
  }
  const runs = results.excursions
    .slice(0, 6)
    .map(
      (run) =>
        `${run.startLabel}→${run.endLabel} ${run.readings} readings` +
        `${run.elapsedMinutes == null ? "" : ` / ${run.elapsedMinutes} min`}` +
        ` ${run.direction} to ${run.direction === "high" ? run.max : run.min}` +
        `${run.condition ? ` at ${run.condition}` : ""}`
    )
    .join("; ");
  const more =
    results.excursions.length > 6
      ? ` (+${results.excursions.length - 6} more)`
      : "";
  return (
    `${results.n} readings of ${config.columnName}, ` +
    `${results.excursions.length} excursion${results.excursions.length === 1 ? "" : "s"}: ${runs}${more}`
  );
}
