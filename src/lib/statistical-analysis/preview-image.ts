import { parseChartSpec } from "@/lib/charts/chart-spec";
import { isValidSuggestionImageSrc } from "@/lib/suggestions/image-insert";
import type { AnalysisPreviewImage } from "./types";

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
