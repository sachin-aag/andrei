import { renderChartPng } from "@/lib/charts/render-chart";
import { resolveCustomerId } from "@/lib/customers/resolve";
import { renderAnovaIntervalPlotPng } from "./render-anova-png";
import { renderSixpackPng } from "./render-sixpack-png";
import {
  isAnovaAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type StatisticalAnalysisSummary,
} from "./types";

export type AnalysisPlotImage = {
  title: string;
  buffer: Buffer;
};

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64, "base64");
}

/**
 * Renders PNG plot images for a saved analysis. Scatter kinds may return
 * multiple images (one per chart spec). Returns an empty array when canvas
 * is unavailable or the analysis has no plottable output.
 */
export async function renderAnalysisPlotImages(
  analysis: StatisticalAnalysisSummary
): Promise<AnalysisPlotImage[]> {
  const packId = resolveCustomerId();

  if (isScatterAnalysis(analysis) || isXyScatterAnalysis(analysis)) {
    const images: AnalysisPlotImage[] = [];
    for (const spec of analysis.results.specs) {
      const rendered = await renderChartPng(spec, { packId });
      if ("error" in rendered) continue;
      images.push({
        title: spec.title,
        buffer: dataUrlToBuffer(rendered.dataUrl),
      });
    }
    return images;
  }

  if (isAnovaAnalysis(analysis)) {
    const buffer = renderAnovaIntervalPlotPng(analysis, { packId });
    if (typeof buffer === "object" && "error" in buffer) return [];
    return [{ title: analysis.title, buffer }];
  }

  if (isSixpackAnalysis(analysis)) {
    const buffer = renderSixpackPng(analysis, { packId });
    if (typeof buffer === "object" && "error" in buffer) return [];
    return [{ title: analysis.title, buffer }];
  }

  const exhaustive: never = analysis;
  return exhaustive;
}
