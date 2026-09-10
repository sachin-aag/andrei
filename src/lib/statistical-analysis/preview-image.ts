import { parseChartSpec } from "@/lib/charts/chart-spec";
import { isAllowedChatImageMediaType } from "@/lib/ai/chat/image-parts";
import type { AnalysisPreviewImage } from "./types";

const PNG_DATA_URL_PREFIX = /^data:image\/png;base64,/i;

/** Analytics sixpack captures are larger than chat figure inserts. */
export const ANALYTICS_PREVIEW_MAX_DATA_URL_CHARS = 3_500_000;

export function isValidAnalysisPreviewSrc(src: string): boolean {
  const trimmed = src.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > ANALYTICS_PREVIEW_MAX_DATA_URL_CHARS
  ) {
    return false;
  }
  const match = /^data:([^;,]+);base64,/i.exec(trimmed);
  if (!match) return false;
  return isAllowedChatImageMediaType(match[1]!.trim().toLowerCase());
}

export function asPreviewImage(value: unknown): AnalysisPreviewImage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<AnalysisPreviewImage>;
  if (
    typeof row.dataUrl !== "string" ||
    !isValidAnalysisPreviewSrc(row.dataUrl) ||
    typeof row.widthPx !== "number" ||
    typeof row.heightPx !== "number" ||
    typeof row.alt !== "string"
  ) {
    return null;
  }
  const chartSpec =
    row.chartSpec == null ? null : parseChartSpec(row.chartSpec);
  return {
    dataUrl: row.dataUrl,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    alt: row.alt,
    chartSpec,
  };
}

/**
 * Identity of the plot a preview was captured from. Rejects in-flight
 * preview uploads after an edit/recompute so Download/insert cannot keep
 * the old PNG.
 */
export function analysisPreviewMatchKey(analysis: {
  sourceHash: string;
  config: unknown;
}): string {
  return JSON.stringify({
    sourceHash: analysis.sourceHash,
    config: analysis.config,
  });
}

/** Decode a stored preview PNG so Excel export and downloads can reuse it. */
export function pngBufferFromDataUrl(dataUrl: string): Buffer | null {
  const trimmed = dataUrl.trim();
  if (!PNG_DATA_URL_PREFIX.test(trimmed)) return null;
  try {
    const buffer = Buffer.from(
      trimmed.replace(PNG_DATA_URL_PREFIX, ""),
      "base64"
    );
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}
