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
  isScatterAnalysis,
  isXyScatterAnalysis,
  type StatisticalAnalysisSummary,
} from "./types";

function chartSpecForAnalysis(analysis: StatisticalAnalysisSummary) {
  if (isScatterAnalysis(analysis) || isXyScatterAnalysis(analysis)) {
    return analysis.results.specs[0] ?? null;
  }
  if (isAnovaAnalysis(analysis) || isBoxplotAnalysis(analysis)) {
    return null;
  }
  return null;
}

/**
 * Download the on-screen plot PNG (stored preview, or a live capture).
 * Falls back to CSV when no image is available.
 */
export async function downloadAnalysisFigure(
  analysis: StatisticalAnalysisSummary,
  captureElement: HTMLElement | null
): Promise<void> {
  if (analysis.previewImage?.dataUrl) {
    downloadAnalysis(analysis);
    return;
  }

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

  downloadTextFile(analysisDownloadFilename(analysis), analysisToCsv(analysis));
}
