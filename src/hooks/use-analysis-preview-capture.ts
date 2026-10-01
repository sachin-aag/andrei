"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { captureAnalysisPreviewFromElement } from "@/lib/statistical-analysis/capture-analysis-preview";
import { isGraphAnalysisKind } from "@/lib/statistical-analysis/insertable-graphs";
import { analysisPreviewMatchKey } from "@/lib/statistical-analysis/preview-image";
import {
  isPermanentPreviewSaveError,
  saveAnalysisPreview,
} from "@/lib/statistical-analysis/client";
import {
  isAnovaAnalysis,
  isBoxplotAnalysis,
  isHistogramAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type ReportAnalyticsView,
  type StatisticalAnalysisSummary,
} from "@/lib/statistical-analysis/types";

function chartSpecForAnalysis(
  analysis: StatisticalAnalysisSummary
) {
  if (isSixpackAnalysis(analysis) || isAnovaAnalysis(analysis) || isBoxplotAnalysis(analysis) || isHistogramAnalysis(analysis)) {
    return null;
  }
  if (isScatterAnalysis(analysis) || isXyScatterAnalysis(analysis)) {
    return analysis.results.specs[0] ?? null;
  }
  return null;
}

/**
 * Analyses whose preview save failed with a 4xx, keyed by analysis + match key.
 *
 * Without this the effect retries on every re-render: previewImage stays null
 * because the save keeps failing, so the guard never trips and each pass
 * rasterizes the whole plot again before posting it. One unsupported analysis
 * kind was enough to peg the main thread. Keyed by match key so an edit or
 * recompute gets a fresh attempt.
 */
const permanentSaveFailures = new Set<string>();

export function useAnalysisPreviewCapture({
  reportId,
  analysis,
  captureRef,
  readOnly,
  onUploaded,
}: {
  reportId: string;
  analysis: StatisticalAnalysisSummary;
  captureRef: RefObject<HTMLElement | null>;
  readOnly: boolean;
  onUploaded: (analytics: ReportAnalyticsView) => void;
}) {
  const uploadingRef = useRef(false);

  useEffect(() => {
    if (readOnly || analysis.previewImage || uploadingRef.current) return;
    if (!isGraphAnalysisKind(analysis.kind)) return;

    const matchKey = analysisPreviewMatchKey(analysis);
    const failureKey = `${analysis.id}:${matchKey}`;
    if (permanentSaveFailures.has(failureKey)) return;

    const element = captureRef.current;
    if (!element) return;

    let cancelled = false;
    uploadingRef.current = true;

    const run = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled) return;

      const preview = await captureAnalysisPreviewFromElement(
        element,
        analysis.title,
        chartSpecForAnalysis(analysis)
      );
      if (cancelled || !preview) return;

      try {
        const analytics = await saveAnalysisPreview(
          reportId,
          analysis.id,
          preview,
          matchKey
        );
        if (!cancelled && analytics) onUploaded(analytics);
      } catch (error) {
        if (isPermanentPreviewSaveError(error)) {
          permanentSaveFailures.add(failureKey);
        }
        console.error(error);
      }
    };

    void run().finally(() => {
      if (!cancelled) uploadingRef.current = false;
    });

    return () => {
      cancelled = true;
      // Allow a follow-up effect (edit / recompute) to recapture. Leaving this
      // true would skip the new capture and keep downloading the old PNG.
      uploadingRef.current = false;
    };
  }, [
    analysis,
    captureRef,
    onUploaded,
    readOnly,
    reportId,
  ]);
}
