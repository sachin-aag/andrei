"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { captureAnalysisPreviewFromElement } from "@/lib/statistical-analysis/capture-analysis-preview";
import { isGraphAnalysisKind } from "@/lib/statistical-analysis/insertable-graphs";
import { saveAnalysisPreview } from "@/lib/statistical-analysis/client";
import {
  isAnovaAnalysis,
  isBoxplotAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type ReportAnalyticsView,
  type StatisticalAnalysisSummary,
} from "@/lib/statistical-analysis/types";

function chartSpecForAnalysis(
  analysis: StatisticalAnalysisSummary
) {
  if (isSixpackAnalysis(analysis) || isAnovaAnalysis(analysis) || isBoxplotAnalysis(analysis)) {
    return null;
  }
  if (isScatterAnalysis(analysis) || isXyScatterAnalysis(analysis)) {
    return analysis.results.specs[0] ?? null;
  }
  return null;
}

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
          preview
        );
        if (!cancelled) onUploaded(analytics);
      } catch (error) {
        console.error(error);
      }
    };

    void run().finally(() => {
      uploadingRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [
    analysis,
    captureRef,
    onUploaded,
    readOnly,
    reportId,
  ]);
}
