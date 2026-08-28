import { parseChartSpec } from "@/lib/charts/chart-spec";
import { resolveCustomerId, type CustomerId } from "@/lib/customers/resolve";
import { isValidSuggestionImageSrc } from "@/lib/suggestions/image-insert";
import { exportAnalysisImage } from "./export-analysis-image";
import { isGraphAnalysisKind } from "./insertable-graphs";
import type {
  AnalysisKind,
  AnalysisPreviewImage,
  CapabilitySixpackConfig,
  CapabilitySixpackResult,
  MeasurementScatterConfig,
  MeasurementScatterResult,
  OneWayAnovaConfig,
  OneWayAnovaResult,
  StatisticalAnalysisSummary,
  XyScatterConfig,
  XyScatterResult,
} from "./types";
import {
  CAPABILITY_SIXPACK_NORMAL,
  MEASUREMENT_SCATTER,
  XY_SCATTER,
} from "./types";

type SnapshotInput = {
  kind: AnalysisKind;
  title: string;
  config:
    | CapabilitySixpackConfig
    | MeasurementScatterConfig
    | OneWayAnovaConfig
    | XyScatterConfig;
  results:
    | CapabilitySixpackResult
    | MeasurementScatterResult
    | OneWayAnovaResult
    | XyScatterResult;
};

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

function draftSummaryForSnapshot(input: SnapshotInput): StatisticalAnalysisSummary {
  const base = {
    id: "snapshot",
    workspaceId: "snapshot",
    title: input.title,
    sourceHash: "",
    stale: false,
    createdAt: new Date(0).toISOString(),
    previewImage: null,
  };
  switch (input.kind) {
    case CAPABILITY_SIXPACK_NORMAL:
      return {
        ...base,
        kind: CAPABILITY_SIXPACK_NORMAL,
        config: input.config as CapabilitySixpackConfig,
        results: input.results as CapabilitySixpackResult,
      };
    case MEASUREMENT_SCATTER:
      return {
        ...base,
        kind: MEASUREMENT_SCATTER,
        config: input.config as MeasurementScatterConfig,
        results: input.results as MeasurementScatterResult,
      };
    case XY_SCATTER:
      return {
        ...base,
        kind: XY_SCATTER,
        config: input.config as XyScatterConfig,
        results: input.results as XyScatterResult,
      };
    default:
      throw new Error(`Unsupported snapshot kind: ${input.kind}`);
  }
}

/** Rasterize an insertable analysis for storage. Returns null when skipped or rasterization fails. */
export async function snapshotAnalysisPreviewImage(
  input: SnapshotInput,
  options: { packId?: CustomerId } = {}
): Promise<AnalysisPreviewImage | null> {
  if (!isGraphAnalysisKind(input.kind)) return null;
  const exported = await exportAnalysisImage(draftSummaryForSnapshot(input), {
    packId: options.packId ?? resolveCustomerId(),
  });
  if ("error" in exported) return null;
  return {
    dataUrl: exported.dataUrl,
    widthPx: exported.widthPx,
    heightPx: exported.heightPx,
    alt: exported.alt,
    chartSpec: exported.chartSpec,
  };
}
