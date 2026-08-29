"use client";

import { toPng } from "html-to-image";
import type { ChartSpec } from "@/lib/charts/chart-spec";
import { CHART_DISPLAY_WIDTH_PX } from "@/lib/charts/chart-dimensions";
import {
  ANALYTICS_PREVIEW_MAX_DATA_URL_CHARS,
  isValidAnalysisPreviewSrc,
} from "./preview-image";
import type { AnalysisPreviewImage } from "./types";

const PIXEL_RATIOS = [2, 1] as const;

export async function captureAnalysisPreviewFromElement(
  element: HTMLElement,
  alt: string,
  chartSpec: ChartSpec | null
): Promise<AnalysisPreviewImage | null> {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width <= 0 || height <= 0) return null;

  try {
    for (const pixelRatio of PIXEL_RATIOS) {
      const dataUrl = await toPng(element, {
        pixelRatio,
        cacheBust: true,
        backgroundColor: "#f4f6f9",
      });
      if (
        !isValidAnalysisPreviewSrc(dataUrl) ||
        dataUrl.length > ANALYTICS_PREVIEW_MAX_DATA_URL_CHARS
      ) {
        continue;
      }
      const widthPx = CHART_DISPLAY_WIDTH_PX;
      const heightPx = Math.max(1, Math.round((widthPx * height) / width));
      return {
        dataUrl,
        widthPx,
        heightPx,
        alt,
        chartSpec,
      };
    }
    return null;
  } catch {
    return null;
  }
}
