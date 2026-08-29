import {
  DEFAULT_CHART_LAYOUT,
  mergeChartLayout,
  splitSpec,
  type ChartLimits,
  type ChartSpec,
} from "@/lib/charts/chart-spec";
import {
  buildChartSpec,
  extractMeasurements,
  type ExtractMeasurementsResult,
} from "@/lib/charts/extract-measurements";
import { nextAnalysisTitle } from "./analysis-title";
import type {
  MeasurementScatterConfig,
  MeasurementScatterLayoutInput,
  MeasurementScatterResult,
} from "./types";

/** Per-side: a provided number wins; null/undefined keeps the extracted limit. */
export function mergeScatterLimits(
  extracted: ChartLimits,
  override: { lsl?: number | null; usl?: number | null }
): ChartLimits {
  return {
    lower: override.lsl ?? extracted.lower,
    upper: override.usl ?? extracted.upper,
  };
}

function applyLimitsToSpecs(specs: ChartSpec[], limits: ChartLimits): ChartSpec[] {
  return specs.map((spec) => ({ ...spec, limits }));
}

export type ScatterExtractFn = (input: {
  reportId: string;
  query: string;
}) => Promise<ExtractMeasurementsResult>;

export function scatterFromExtraction(
  extraction: Extract<ExtractMeasurementsResult, { status: "ok" }>,
  input: {
    query: string;
    title?: string;
    xLabel?: string;
    yLabel?: string;
    layout?: MeasurementScatterLayoutInput;
    lsl?: number | null;
    usl?: number | null;
    existingTitles: readonly string[];
  }
): { config: MeasurementScatterConfig; results: MeasurementScatterResult } {
  const query = extraction.query || input.query.trim();
  const title = nextAnalysisTitle(
    input.existingTitles,
    input.title?.trim() || query
  );
  const xLabel = input.xLabel?.trim() || "Measurement";
  const yLabel = input.yLabel?.trim() || `Value (${extraction.uom})`;
  const layout = mergeChartLayout(DEFAULT_CHART_LAYOUT, input.layout ?? {});
  const lsl = input.lsl ?? null;
  const usl = input.usl ?? null;
  const spec = buildChartSpec({
    query,
    title,
    xLabel,
    yLabel,
    layout,
    extraction,
  });
  const limits = mergeScatterLimits(spec.limits, { lsl, usl });
  const specs = applyLimitsToSpecs(splitSpec(spec), limits);
  return {
    config: { query, title, xLabel, yLabel, layout, lsl, usl },
    results: {
      specs,
      n: spec.points.length,
      uom: extraction.uom,
    },
  };
}

export async function runMeasurementScatter(input: {
  reportId: string;
  query: string;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  layout?: MeasurementScatterLayoutInput;
  lsl?: number | null;
  usl?: number | null;
  existingTitles: readonly string[];
  extract?: ScatterExtractFn;
}): Promise<
  | { ok: true; config: MeasurementScatterConfig; results: MeasurementScatterResult }
  | { ok: false; error: string }
> {
  const extract = input.extract ?? extractMeasurements;
  const extraction = await extract({
    reportId: input.reportId,
    query: input.query,
  });
  if (extraction.status !== "ok") {
    return { ok: false, error: extraction.message };
  }
  return {
    ok: true,
    ...scatterFromExtraction(extraction, input),
  };
}
