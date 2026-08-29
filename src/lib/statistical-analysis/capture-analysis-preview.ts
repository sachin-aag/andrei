"use client";

import { toPng } from "html-to-image";
import type { ChartSpec } from "@/lib/charts/chart-spec";
import { CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS } from "@/lib/ai/chat/section-images";
import { CHART_DISPLAY_WIDTH_PX } from "@/lib/charts/chart-dimensions";
import { isValidSuggestionImageSrc } from "@/lib/suggestions/image-insert";
import type { AnalysisPreviewImage } from "./types";

export async function captureAnalysisPreviewFromElement(
  element: HTMLElement,
  alt: string,
  chartSpec: ChartSpec | null
): Promise<AnalysisPreviewImage | null> {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width <= 0 || height <= 0) return null;

  try {
    const dataUrl = await toPng(element, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#f4f6f9",
    });
    if (
      !isValidSuggestionImageSrc(dataUrl) ||
      dataUrl.length > CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS
    ) {
      return null;
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
  } catch {
    return null;
  }
}
