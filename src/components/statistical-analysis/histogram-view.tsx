"use client";

import { useRef } from "react";
import { CapabilityHistogramChart } from "@/components/statistical-analysis/sixpack-view";
import { downloadAnalysisFigure } from "@/lib/statistical-analysis/download-figure";
import { formatStat } from "@/lib/statistical-analysis/format";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import { histogramOverlays } from "@/lib/statistical-analysis/types";
import type {
  HistogramAnalysisSummary,
  ReportAnalyticsView,
} from "@/lib/statistical-analysis/types";
import { useAnalysisPreviewCapture } from "@/hooks/use-analysis-preview-capture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnalysisRecomputeButton } from "@/components/statistical-analysis/analysis-recompute-button";

export function HistogramView({
  analysis,
  reportId,
  onPreviewUploaded,
  onEdit,
  onRecompute,
  onDelete,
  editing = false,
  recomputing = false,
  readOnly = false,
}: {
  analysis: HistogramAnalysisSummary;
  reportId: string;
  onPreviewUploaded: (analytics: ReportAnalyticsView) => void;
  onEdit: () => void;
  onRecompute: () => void;
  onDelete: () => void;
  editing?: boolean;
  recomputing?: boolean;
  readOnly?: boolean;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  useAnalysisPreviewCapture({
    reportId,
    analysis,
    captureRef,
    readOnly,
    onUploaded: onPreviewUploaded,
  });
  const { config, results, stale, title } = analysis;
  const overlays = histogramOverlays(config);
  const rowLabel = formatRowSelection(normalizeRowSelection(config));

  return (
    <div
      data-testid="histogram"
      className="flex h-full flex-col gap-3 overflow-auto p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            Histogram of {config.columnName}
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            {title}
            {rowLabel ? ` · ${rowLabel}` : ""} · n = {results.n}
            {results.skipped > 0 ? ` · skipped ${results.skipped}` : ""} · mean{" "}
            {formatStat(results.mean)} · StDev {formatStat(results.overallStdev)}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 sm:min-w-[18rem]">
          <div className="flex flex-wrap items-center gap-2">
            {stale ? (
              <Badge data-testid="histogram-stale-badge" variant="warning">
                Stale
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="download-analysis"
              onClick={() => {
                void downloadAnalysisFigure(analysis, captureRef.current);
              }}
            >
              Download
            </Button>
            {readOnly ? null : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="edit-analysis"
                  disabled={editing}
                  onClick={onEdit}
                >
                  {editing ? "Opening…" : "Edit"}
                </Button>
                <AnalysisRecomputeButton
                  onClick={onRecompute}
                  recomputing={recomputing}
                  disabled={editing}
                />
              </>
            )}
          </div>
          {readOnly ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="delete-analysis"
              onClick={() => void onDelete()}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
      <div
        ref={captureRef}
        data-testid="analysis-preview-figure"
        className="min-h-[360px] rounded-md bg-[#f4f6f9] p-2"
      >
        <CapabilityHistogramChart
          bins={results.histogram.bins}
          overallCurve={results.histogram.overallCurve}
          withinCurve={results.histogram.withinCurve}
          lsl={config.lsl}
          usl={config.usl}
          showDistributionLines={overlays.showDistributionLines}
          showLsl={overlays.showLsl}
          showUsl={overlays.showUsl}
          testIdPrefix="histogram"
          size="full"
        />
      </div>
    </div>
  );
}
