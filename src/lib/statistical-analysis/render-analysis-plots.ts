import {
  CHART_DISPLAY_WIDTH_PX,
  CHART_LOGICAL_HEIGHT,
  CHART_LOGICAL_WIDTH,
} from "@/lib/charts/chart-dimensions";
import { renderChartPng } from "@/lib/charts/render-chart";
import { resolveCustomerId } from "@/lib/customers/resolve";
import { pngBufferFromDataUrl } from "./preview-image";
import { renderAnovaIntervalPlotPng } from "./render-anova-png";
import { renderBoxplotPng } from "./render-boxplot-png";
import {
  renderSixpackPng,
  SIXPACK_PNG_HEIGHT,
  SIXPACK_PNG_WIDTH,
} from "./render-sixpack-png";
import {
  isAnovaAnalysis,
  isBoxplotAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type StatisticalAnalysisSummary,
} from "./types";

export type AnalysisPlotImage = {
  title: string;
  buffer: Buffer;
  width: number;
  height: number;
};

const FALLBACK_CHART_HEIGHT_PX = Math.round(
  (CHART_DISPLAY_WIDTH_PX * CHART_LOGICAL_HEIGHT) / CHART_LOGICAL_WIDTH
);
const SIXPACK_DISPLAY_WIDTH_PX = 1100;
const SIXPACK_DISPLAY_HEIGHT_PX = Math.round(
  (SIXPACK_DISPLAY_WIDTH_PX * SIXPACK_PNG_HEIGHT) / SIXPACK_PNG_WIDTH
);

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
        width: rendered.widthPx,
        height: rendered.heightPx,
      });
    }
    return images;
  }

  if (isAnovaAnalysis(analysis)) {
    const buffer = renderAnovaIntervalPlotPng(analysis, { packId });
    if (typeof buffer === "object" && "error" in buffer) return [];
    return [
      {
        title: analysis.title,
        buffer,
        width: CHART_DISPLAY_WIDTH_PX,
        height: FALLBACK_CHART_HEIGHT_PX,
      },
    ];
  }

  if (isBoxplotAnalysis(analysis)) {
    const buffer = renderBoxplotPng(analysis, { packId });
    if (typeof buffer === "object" && "error" in buffer) return [];
    return [
      {
        title: analysis.title,
        buffer,
        width: CHART_DISPLAY_WIDTH_PX,
        height: FALLBACK_CHART_HEIGHT_PX,
      },
    ];
  }

  if (isSixpackAnalysis(analysis)) {
    const buffer = renderSixpackPng(analysis, { packId });
    if (typeof buffer === "object" && "error" in buffer) return [];
    return [
      {
        title: analysis.title,
        buffer,
        width: SIXPACK_DISPLAY_WIDTH_PX,
        height: SIXPACK_DISPLAY_HEIGHT_PX,
      },
    ];
  }

  const exhaustive: never = analysis;
  return exhaustive;
}

/**
 * Prefer the captured Analytics preview (same PNG as document insert /
 * Download). Fall back to a server-side raster when the plot was never opened.
 */
export async function plotImagesForExport(
  analysis: StatisticalAnalysisSummary
): Promise<AnalysisPlotImage[]> {
  const preview = analysis.previewImage;
  if (preview) {
    const buffer = pngBufferFromDataUrl(preview.dataUrl);
    if (buffer) {
      const aspect = preview.heightPx / Math.max(1, preview.widthPx);
      const width = Math.min(
        1100,
        Math.max(preview.widthPx, SIXPACK_DISPLAY_WIDTH_PX)
      );
      return [
        {
          title: preview.alt || analysis.title,
          buffer,
          width,
          height: Math.max(1, Math.round(width * aspect)),
        },
      ];
    }
  }
  return renderAnalysisPlotImages(analysis);
}
