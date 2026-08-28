import type { ChartSpec } from "@/lib/charts/chart-spec";
import {
  CHART_DISPLAY_WIDTH_PX,
  renderChartPng,
  type RenderedChart,
} from "@/lib/charts/render-chart";
import { resolveCustomerId, type CustomerId } from "@/lib/customers/resolve";
import {
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type SixpackAnalysisSummary,
  type StatisticalAnalysisSummary,
} from "./types";
import { renderSixpackPng } from "./render-sixpack-png";

export type ExportedAnalysisImage = {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  alt: string;
  chartSpec: ChartSpec | null;
};

export type ExportAnalysisImageError = {
  error: "unsupported" | "no_chart" | "canvas_unavailable" | "too_large";
};

export async function exportAnalysisImage(
  analysis: StatisticalAnalysisSummary,
  options: { packId?: CustomerId; specIndex?: number } = {}
): Promise<ExportedAnalysisImage | ExportAnalysisImageError> {
  const packId = options.packId ?? resolveCustomerId();

  if (isSixpackAnalysis(analysis)) {
    const rendered = await renderSixpackPng(analysis as SixpackAnalysisSummary, {
      packId,
    });
    if ("error" in rendered) return { error: rendered.error };
    return toExportedImage(analysis.title, rendered, null);
  }

  if (isScatterAnalysis(analysis) || isXyScatterAnalysis(analysis)) {
    const specIndex = options.specIndex ?? 0;
    const spec = analysis.results.specs[specIndex];
    if (!spec) return { error: "no_chart" };
    const rendered = await renderChartPng(spec, { packId });
    if ("error" in rendered) return { error: rendered.error };
    return toExportedImage(spec.title || analysis.title, rendered, spec);
  }

  return { error: "unsupported" };
}

function toExportedImage(
  alt: string,
  rendered: Pick<RenderedChart, "dataUrl" | "widthPx" | "heightPx">,
  chartSpec: ChartSpec | null
): ExportedAnalysisImage {
  return {
    dataUrl: rendered.dataUrl,
    widthPx: rendered.widthPx ?? CHART_DISPLAY_WIDTH_PX,
    heightPx: rendered.heightPx,
    alt,
    chartSpec,
  };
}
