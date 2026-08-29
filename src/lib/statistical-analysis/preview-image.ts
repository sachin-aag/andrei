import { parseChartSpec } from "@/lib/charts/chart-spec";
import { isValidSuggestionImageSrc } from "@/lib/suggestions/image-insert";
import type { AnalysisPreviewImage } from "./types";

const PNG_DATA_URL_PREFIX = /^data:image\/png;base64,/i;

export function asPreviewImage(value: unknown): AnalysisPreviewImage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<AnalysisPreviewImage>;
  if (
    typeof row.dataUrl !== "string" ||
    !isValidSuggestionImageSrc(row.dataUrl) ||
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
