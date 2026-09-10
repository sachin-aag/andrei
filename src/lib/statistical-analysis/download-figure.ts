"use client";

import { captureAnalysisPreviewFromElement } from "./capture-analysis-preview";
import {
  analysisImageDownloadFilename,
  analysisToCsv,
  analysisDownloadFilename,
  downloadAnalysis,
  downloadDataUrl,
  downloadTextFile,
} from "./download";
import {
  isAnovaAnalysis,
  isBoxplotAnalysis,
  isHistogramAnalysis,
  isScatterAnalysis,
  isXyScatterAnalysis,
  type StatisticalAnalysisSummary,
} from "./types";

function chartSpecForAnalysis(analysis: StatisticalAnalysisSummary) {
  if (isScatterAnalysis(analysis) || isXyScatterAnalysis(analysis)) {
    return analysis.results.specs[0] ?? null;
  }
  if (isAnovaAnalysis(analysis) || isBoxplotAnalysis(analysis) || isHistogramAnalysis(analysis)) {
    return null;
  }
  return null;
}

/**
 * Download the on-screen plot PNG. Prefer a live capture of the figure that is
 * currently rendered so Download after an edit matches the chart on screen.
 * Fall back to the stored preview, then CSV.
 */
export async function downloadAnalysisFigure(
  analysis: StatisticalAnalysisSummary,
  captureElement: HTMLElement | null
): Promise<void> {
  if (captureElement) {
    const captured = await captureAnalysisPreviewFromElement(
      captureElement,
      analysis.title,
      chartSpecForAnalysis(analysis)
    );
    if (captured?.dataUrl) {
      downloadDataUrl(
        analysisImageDownloadFilename(analysis),
        captured.dataUrl
      );
      return;
    }
  }

  if (analysis.previewImage?.dataUrl) {
    downloadAnalysis(analysis);
    return;
  }

  downloadTextFile(analysisDownloadFilename(analysis), analysisToCsv(analysis));
}
