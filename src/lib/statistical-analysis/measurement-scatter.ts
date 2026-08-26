import {
  DEFAULT_CHART_LAYOUT,
  mergeChartLayout,
  splitSpec,
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
  const spec = buildChartSpec({
    query,
    title,
    xLabel,
    yLabel,
    layout,
    extraction,
  });
  const specs = splitSpec(spec);
  return {
    config: { query, title, xLabel, yLabel, layout },
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
