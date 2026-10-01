import type { CitedPage, HardFact } from "@/lib/ai/chat/claim-facts";
import {
  isAnovaAnalysis,
  isBoxplotAnalysis,
  isHistogramAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isTimeSeriesAnalysis,
  isXyScatterAnalysis,
  type StatisticalAnalysisSummary,
  type WorksheetData,
} from "@/lib/statistical-analysis/types";

/**
 * Values a saved analysis computed, as citable evidence.
 *
 * `groundDraftText` verifies hard facts against quotes served from attachment
 * pages, which is right for a number copied off a page and wrong for one the
 * product worked out. "8 out-of-band readings over 7 minutes" is printed
 * nowhere — it is the result of reading 2,142 rows — so a page-quote check can
 * only ever call it invented.
 *
 * The precedent is the charts plan: a chart is a faithful rendering of numbers
 * that exist on cited pages, not an invention, *as long as the rendering stays
 * derivable*. The same argument covers scalars. A value a saved analysis
 * computed over cited rows is derivable in exactly that sense, so it is
 * written and cited to the analysis **and** its source pages.
 *
 * What this deliberately does not do is relax anything else. A number that no
 * analysis computed is still unsourced, and a number that contradicts the
 * analysis it claims to come from does not appear in this set, so it is still
 * unsourced. Nothing here is pack-gated: a grounding gate that behaves
 * differently per tenant is how invented facts reach a regulated document.
 */

export type AnalysisEvidence = {
  analysisId: string;
  title: string;
  /** Canonical numeric strings the analysis computed. */
  values: Set<string>;
  /** Pages the analysed rows came from, for the citation. */
  pages: CitedPage[];
};

/** Both `7` and `7.0` should match a computed 7. */
function numberForms(value: number | null | undefined): string[] {
  if (value == null || !Number.isFinite(value)) return [];
  const forms = new Set<string>([String(value)]);
  if (Number.isInteger(value)) {
    forms.add(value.toFixed(1));
    forms.add(value.toFixed(2));
  } else {
    forms.add(value.toFixed(1));
    forms.add(value.toFixed(2));
    forms.add(value.toFixed(3));
    // A rounded quote of a computed value is the same claim.
    forms.add(String(Math.round(value)));
  }
  return [...forms];
}

function addValues(
  into: Set<string>,
  ...values: Array<number | string | null | undefined>
): void {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string") {
      const text = value.trim();
      if (text) into.add(text.toLowerCase());
      continue;
    }
    for (const form of numberForms(value)) into.add(form);
  }
}

/**
 * The numbers one saved analysis stands behind. Only computed outputs belong
 * here — a config limit the engineer typed is not something the analysis
 * verified, so LSL/USL are left out on purpose.
 */
export function analysisEvidence(
  analysis: StatisticalAnalysisSummary,
  pages: readonly CitedPage[] = []
): AnalysisEvidence {
  const values = new Set<string>();

  if (isTimeSeriesAnalysis(analysis)) {
    const { results } = analysis;
    addValues(
      values,
      results.n,
      results.skipped,
      results.mean,
      results.min,
      results.max,
      results.excursions.length,
      results.excursionReadings
    );
    for (const run of results.excursions) {
      addValues(
        values,
        run.readings,
        run.elapsedMinutes,
        run.elapsedClock,
        run.min,
        run.max
      );
    }
  } else if (isSixpackAnalysis(analysis)) {
    const { results } = analysis;
    const capability = results.capability as Record<string, unknown>;
    addValues(values, results.n, results.mean, results.overallStdev, results.withinStdev);
    for (const key of ["cp", "cpk", "pp", "ppk", "cpl", "cpu"]) {
      const value = capability?.[key];
      if (typeof value === "number") addValues(values, value);
    }
  } else if (isHistogramAnalysis(analysis)) {
    const { results } = analysis;
    addValues(
      values,
      results.n,
      results.skipped,
      results.mean,
      results.overallStdev,
      results.withinStdev
    );
  } else if (isAnovaAnalysis(analysis)) {
    const results = analysis.results as unknown as Record<string, unknown>;
    for (const key of ["fStatistic", "pValue", "n"]) {
      const value = results[key];
      if (typeof value === "number") addValues(values, value);
    }
  } else if (isBoxplotAnalysis(analysis)) {
    const { results } = analysis;
    addValues(values, results.n, results.groups.length);
    for (const group of results.groups) {
      const row = group as unknown as Record<string, unknown>;
      for (const key of ["median", "q1", "q3", "min", "max", "mean", "n"]) {
        const value = row[key];
        if (typeof value === "number") addValues(values, value);
      }
    }
  } else if (isScatterAnalysis(analysis) || isXyScatterAnalysis(analysis)) {
    // Scatter points come straight off cited pages; the page quote already
    // covers them, so there is nothing derived to stand behind.
    addValues(values, analysis.results.n);
  }

  return {
    analysisId: analysis.id,
    title: analysis.title,
    values,
    pages: [...pages],
  };
}

/**
 * The analysis that computed this fact, or null.
 *
 * Matching is on the numeric tokens inside the fact, so "7 minutes",
 * "7 min" and "7" all match a computed 7 while "9 minutes" matches nothing.
 * Dates and identifiers are never analysis-derived — an analysis computes
 * quantities, not document numbers — so they are left to the page ledger.
 */
export function analysisSupportingFact(
  fact: HardFact,
  evidence: readonly AnalysisEvidence[]
): AnalysisEvidence | null {
  if (evidence.length === 0) return null;
  if (fact.kind === "identifier" || fact.kind === "date") return null;
  const tokens = factNumericTokens(fact);
  if (tokens.length === 0) return null;
  for (const entry of evidence) {
    if (tokens.every((token) => entry.values.has(token))) return entry;
  }
  return null;
}

export function factNumericTokens(fact: HardFact): string[] {
  const raw = fact.text.replace(/,/g, "");
  const clock = raw.match(/\b\d{1,3}:\d{2}(?::\d{2})?\b/g) ?? [];
  if (clock.length > 0) return clock.map((value) => value.toLowerCase());
  return raw.match(/\d+(?:\.\d+)?/g) ?? [];
}

/**
 * Evidence for every saved analysis on a report, with each one's source pages
 * taken from the worksheet columns it read. Those citations were written by
 * `load_table` / `write_column` off the attachment pages the rows came from,
 * so a derived value stays traceable to paper.
 */
export function analysisEvidenceForReport(analytics: {
  worksheet: WorksheetData;
  analyses: readonly StatisticalAnalysisSummary[];
}): AnalysisEvidence[] {
  const columnPages = new Map<string, CitedPage[]>();
  for (const sheet of analytics.worksheet.sheets ?? []) {
    for (const column of sheet.columns) {
      const pages: CitedPage[] = [];
      for (const citation of column.citations ?? []) {
        if (citation.page == null || !citation.filename) continue;
        pages.push({ filename: citation.filename, page: citation.page });
      }
      if (pages.length > 0) columnPages.set(column.id, pages);
    }
  }

  return analytics.analyses.map((analysis) => {
    const pages = new Map<string, CitedPage>();
    for (const columnId of analysisColumnIds(analysis)) {
      for (const page of columnPages.get(columnId) ?? []) {
        pages.set(`${page.filename.toLowerCase()}|${page.page}`, page);
      }
    }
    return analysisEvidence(analysis, [...pages.values()]);
  });
}

/** Worksheet columns an analysis reads, so its citations can be gathered. */
function analysisColumnIds(analysis: StatisticalAnalysisSummary): string[] {
  if (isTimeSeriesAnalysis(analysis)) {
    return [
      analysis.config.columnId,
      analysis.config.timeColumnId,
      analysis.config.clockColumnId,
      analysis.config.conditionColumnId,
    ].filter((id): id is string => Boolean(id));
  }
  if (isSixpackAnalysis(analysis) || isHistogramAnalysis(analysis)) {
    return [analysis.config.columnId];
  }
  if (isAnovaAnalysis(analysis)) {
    return [analysis.config.responseColumnId, analysis.config.factorColumnId];
  }
  if (isBoxplotAnalysis(analysis)) {
    return [analysis.config.yColumnId, ...analysis.config.categoryColumnIds];
  }
  if (isXyScatterAnalysis(analysis)) {
    return [
      analysis.config.yColumnId,
      analysis.config.xColumnId,
      analysis.config.legendColumnId,
    ].filter((id): id is string => Boolean(id));
  }
  return [];
}
