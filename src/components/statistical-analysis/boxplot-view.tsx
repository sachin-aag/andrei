"use client";

import { useRef } from "react";
import {
  boxplotXAxisLabel,
  boxplotYAxisLabel,
  nestedCategorySpans,
} from "@/lib/statistical-analysis/boxplot";
import {
  boxplotAxisLayout,
  boxplotXAxisTitleY,
} from "@/lib/statistical-analysis/boxplot-chart-layout";
import { downloadAnalysisFigure } from "@/lib/statistical-analysis/download-figure";
import { formatStat } from "@/lib/statistical-analysis/format";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import type {
  BoxplotAnalysisSummary,
  BoxplotGroupStats,
  ReportAnalyticsView,
} from "@/lib/statistical-analysis/types";
import { useAnalysisPreviewCapture } from "@/hooks/use-analysis-preview-capture";
import { chartBrandColors } from "@/lib/charts/brand-colors";
import {
  chartShowsMeanLine,
  finiteMean,
  MEAN_LINE_MARKER_RADIUS,
} from "@/lib/charts/mean-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnalysisRecomputeButton } from "@/components/statistical-analysis/analysis-recompute-button";

function yExtent(groups: BoxplotGroupStats[]): { min: number; max: number } {
  const ys = groups.flatMap((group) => [
    group.whiskerLow,
    group.whiskerHigh,
    ...group.outliers,
  ]);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    min = (Number.isFinite(min) ? min : 0) - 1;
    max = (Number.isFinite(max) ? max : 0) + 1;
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

function yTicks(min: number, max: number): number[] {
  const span = max - min || 1;
  const step = niceStep(span / 4);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.01; value += step) {
    ticks.push(Number(value.toPrecision(8)));
  }
  return ticks.length > 0 ? ticks : [min, max];
}

function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
  const scaled = raw / magnitude;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * magnitude;
}

function BoxplotChart({ analysis }: { analysis: BoxplotAnalysisSummary }) {
  const colors = chartBrandColors();
  const groups = analysis.results.groups;
  const categoryCount = analysis.config.categoryColumnNames.length;
  if (groups.length === 0) return null;

  const layout = boxplotAxisLayout(groups, categoryCount);
  const {
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    plotWidth,
    plotHeight,
    rotateInner,
    categoryLabelY,
  } = layout;
  const { min: yMin, max: yMax } = yExtent(groups);
  const ySpan = yMax - yMin || 1;
  const xToPx = (index: number) =>
    plotLeft + ((index + 0.5) / groups.length) * plotWidth;
  const yToPx = (y: number) => plotBottom - ((y - yMin) / ySpan) * plotHeight;
  const boxWidth = Math.min(42, (plotWidth / groups.length) * 0.55);
  const ticks = yTicks(yMin, yMax);
  const yLabel = boxplotYAxisLabel(analysis.config);
  const xLabel = boxplotXAxisLabel(analysis.config);
  const xTitleY = xLabel ? boxplotXAxisTitleY(layout, categoryCount) : 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={analysis.title}
      data-testid="boxplot-chart"
      className="max-h-[480px] rounded-md border border-[var(--border)] bg-white"
    >
      <rect width={width} height={height} fill="#f4f6f9" />
      <rect
        x={plotLeft}
        y={plotTop}
        width={plotWidth}
        height={plotHeight}
        fill={colors.plotFill}
        stroke={colors.grid}
      />
      <text
        x={(plotLeft + plotRight) / 2}
        y={28}
        textAnchor="middle"
        fontSize="16"
        fill={colors.brand800}
      >
        {analysis.title}
      </text>
      <text
        x={22}
        y={(plotTop + plotBottom) / 2}
        textAnchor="middle"
        fontSize="12"
        fill={colors.axis}
        transform={`rotate(-90 22 ${(plotTop + plotBottom) / 2})`}
      >
        {yLabel}
      </text>
      {ticks.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={plotLeft}
            x2={plotRight}
            y1={yToPx(tick)}
            y2={yToPx(tick)}
            stroke={colors.grid}
          />
          <text
            x={plotLeft - 8}
            y={yToPx(tick) + 4}
            textAnchor="end"
            fontSize="11"
            fill={colors.axis}
          >
            {formatStat(tick, 2)}
          </text>
        </g>
      ))}
      {groups.map((group, index) => {
        const x = xToPx(index);
        const q1 = yToPx(group.q1);
        const q3 = yToPx(group.q3);
        const median = yToPx(group.median);
        const low = yToPx(group.whiskerLow);
        const high = yToPx(group.whiskerHigh);
        const boxTop = Math.min(q1, q3);
        const boxHeight = Math.max(1, Math.abs(q3 - q1));
        return (
          <g key={`box-${index}`} data-testid={`boxplot-group-${index}`}>
            <line
              x1={x}
              x2={x}
              y1={high}
              y2={boxTop}
              stroke={colors.brand800}
            />
            <line
              x1={x}
              x2={x}
              y1={q1 > q3 ? q1 : q3}
              y2={low}
              stroke={colors.brand800}
            />
            <line
              x1={x - 8}
              x2={x + 8}
              y1={high}
              y2={high}
              stroke={colors.brand800}
            />
            <line
              x1={x - 8}
              x2={x + 8}
              y1={low}
              y2={low}
              stroke={colors.brand800}
            />
            <rect
              x={x - boxWidth / 2}
              y={boxTop}
              width={boxWidth}
              height={boxHeight}
              fill={colors.brand400}
              fillOpacity={0.45}
              stroke={colors.brand600}
              strokeWidth={1.4}
            />
            <line
              x1={x - boxWidth / 2}
              x2={x + boxWidth / 2}
              y1={median}
              y2={median}
              stroke={colors.brand600}
              strokeWidth={1.8}
            />
            {group.outliers.map((value, outlierIndex) => (
              <text
                key={`out-${index}-${outlierIndex}`}
                x={x}
                y={yToPx(value) + 4}
                textAnchor="middle"
                fontSize="13"
                fill={colors.brand800}
                data-testid={`boxplot-outlier-${index}-${outlierIndex}`}
              >
                *
              </text>
            ))}
          </g>
        );
      })}
      {chartShowsMeanLine(analysis.config) ? (
        <g data-testid="boxplot-mean-line">
          {groups.filter((group) => finiteMean(group.mean) != null).length >=
          2 ? (
            <polyline
              points={groups
                .map((group, index) => {
                  const mean = finiteMean(group.mean);
                  return mean == null
                    ? null
                    : `${xToPx(index)},${yToPx(mean)}`;
                })
                .filter((point): point is string => point != null)
                .join(" ")}
              fill="none"
              stroke={colors.brand600}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {groups.map((group, index) => {
            const mean = finiteMean(group.mean);
            if (mean == null) return null;
            return (
              <circle
                key={`mean-${index}`}
                data-testid={`boxplot-mean-marker-${index}`}
                cx={xToPx(index)}
                cy={yToPx(mean)}
                r={MEAN_LINE_MARKER_RADIUS}
                fill={colors.brand600}
                stroke="#fff"
                strokeWidth="1.25"
              >
                <title>Mean: {formatStat(mean, 3)}</title>
              </circle>
            );
          })}
        </g>
      ) : null}
      {categoryCount === 0
        ? null
        : Array.from({ length: categoryCount }, (_, level) => {
            const spans = nestedCategorySpans(groups, level);
            const y = categoryLabelY(level);
            return (
              <g
                key={`axis-${level}`}
                data-testid={`boxplot-axis-level-${level}`}
              >
                {spans.map((span) => {
                  const start = xToPx(span.startIndex) - plotWidth / groups.length / 2;
                  const end = xToPx(span.startIndex + span.count - 1) + plotWidth / groups.length / 2;
                  const mid = (start + end) / 2;
                  return (
                    <g key={`${level}-${span.startIndex}-${span.label}`}>
                      {level > 0 ? (
                        <line
                          x1={start + 4}
                          x2={end - 4}
                          y1={y - 10}
                          y2={y - 10}
                          stroke={colors.axis}
                        />
                      ) : null}
                      <text
                        x={mid}
                        y={y}
                        textAnchor={level === 0 && rotateInner ? "end" : "middle"}
                        fontSize={level === 0 ? "11" : "12"}
                        fill={colors.axis}
                        transform={
                          level === 0 && rotateInner
                            ? `rotate(-45 ${mid} ${y})`
                            : undefined
                        }
                      >
                        {span.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
      {xLabel ? (
        <text
          x={(plotLeft + plotRight) / 2}
          y={xTitleY}
          textAnchor="middle"
          fontSize="12"
          fill={colors.axis}
          data-testid="boxplot-x-axis-title"
        >
          {xLabel}
        </text>
      ) : null}
    </svg>
  );
}

export function BoxplotView({
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
  analysis: BoxplotAnalysisSummary;
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
  const rowLabel = formatRowSelection(normalizeRowSelection(config));
  const by =
    config.categoryColumnNames.length > 0
      ? ` by ${config.categoryColumnNames.join(", ")}`
      : "";

  return (
    <div
      data-testid="boxplot"
      className="flex h-full flex-col gap-3 overflow-auto p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            Boxplot of {config.yColumnName}
            {by}
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            {title}
            {rowLabel ? ` · ${rowLabel}` : ""} · Tukey · n = {results.n}
            {results.skipped > 0 ? ` · skipped ${results.skipped}` : ""}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 sm:min-w-[18rem]">
          <div className="flex flex-wrap items-center gap-2">
            {stale ? (
              <Badge data-testid="boxplot-stale-badge" variant="warning">
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
        className="rounded-md bg-[#f4f6f9] p-2"
      >
        <BoxplotChart analysis={analysis} />
      </div>
    </div>
  );
}
