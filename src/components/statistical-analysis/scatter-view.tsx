"use client";

import { useRef } from "react";
import {
  isXyScatterAnalysis,
  xyScatterVersusLabel,
  type ReportAnalyticsView,
  type ScatterAnalysisSummary,
  type XyScatterAnalysisSummary,
} from "@/lib/statistical-analysis/types";
import { useAnalysisPreviewCapture } from "@/hooks/use-analysis-preview-capture";
import { formatStat } from "@/lib/statistical-analysis/format";
import { downloadAnalysisFigure } from "@/lib/statistical-analysis/download-figure";
import {
  formatChartProvenance,
  layoutPoints,
  resolveXRange,
  resolveYRange,
  xTickValues,
  yTickValues,
  chartShowsSpecLimits,
  type ChartPoint,
  type ChartSpec,
} from "@/lib/charts/chart-spec";
import { chartBrandColors, seriesFill } from "@/lib/charts/brand-colors";
import {
  columnBarWidthPx,
  markGeometry,
  parseChartMark,
} from "@/lib/charts/chart-marks";
import {
  layoutHorizontalSpecLabels,
  type HorizontalSpecKind,
} from "@/lib/statistical-analysis/spec-limit-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnalysisRecomputeButton } from "@/components/statistical-analysis/analysis-recompute-button";

const WIDTH = 960;
const HEIGHT = 720;

function uniqueSeries(points: ChartPoint[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const point of points) {
    const key = point.series ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  return ordered.toSorted((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

function formatTick(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

function ScatterChart({ spec }: { spec: ChartSpec }) {
  const colors = chartBrandColors();
  const points = layoutPoints(spec);
  if (points.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No measurement points to plot.
      </p>
    );
  }
  const yRange = resolveYRange(spec);
  const yTicks = yTickValues({ ...spec, points });
  const xRange = resolveXRange({ ...spec, points });
  const xTicks = xTickValues({ ...spec, points });
  const seriesNames = uniqueSeries(points);
  const showLegend = spec.layout.seriesBy === "unit" && seriesNames.some((name) => name);
  const legendWidth = showLegend ? 168 : 0;
  const plotLeft = 88;
  const plotRight = WIDTH - 28 - legendWidth;
  const plotTop = 64;
  const plotBottom = HEIGHT - 72;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const xSpan = Math.max(1e-9, xRange.max - xRange.min);
  const xToPx = (x: number) => plotLeft + ((x - xRange.min) / xSpan) * plotWidth;
  const yToPx = (y: number) =>
    plotBottom - ((y - yRange.min) / (yRange.max - yRange.min)) * plotHeight;
  const seriesIndex = new Map(seriesNames.map((name, index) => [name, index]));
  const colorFor = (series: string | null) =>
    spec.layout.seriesBy === "unit"
      ? seriesFill(colors, seriesIndex.get(series ?? "") ?? 0)
      : colors.brand600;
  const geometry = markGeometry({
    points,
    mark: spec.layout.mark,
    seriesBy: spec.layout.seriesBy,
  });
  const mark = parseChartMark(spec.layout.mark);
  const barWidth =
    geometry.type === "columns"
      ? columnBarWidthPx(
          geometry.segments.map((segment) => segment.x),
          xToPx
        )
      : 0;
  const plotBox = {
    left: plotLeft,
    right: plotRight,
    top: plotTop,
    bottom: plotBottom,
  };
  const specLimits: Array<{
    kind: HorizontalSpecKind;
    value: number;
    lineY: number;
  }> = [];
  if (chartShowsSpecLimits(spec.layout)) {
    if (spec.limits.lower != null) {
      specLimits.push({
        kind: "lsl",
        value: spec.limits.lower,
        lineY: yToPx(spec.limits.lower),
      });
    }
    if (spec.limits.upper != null) {
      specLimits.push({
        kind: "usl",
        value: spec.limits.upper,
        lineY: yToPx(spec.limits.upper),
      });
    }
  }
  const specLabels = layoutHorizontalSpecLabels(specLimits, plotBox);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={spec.title}
      data-testid="measurement-scatter-chart"
      data-chart-mark={mark}
      className="max-h-[520px] rounded-md border border-[var(--border)] bg-white"
    >
      <rect width={WIDTH} height={HEIGHT} fill={colors.plotFill} />
      <text
        x={(plotLeft + plotRight) / 2}
        y={32}
        textAnchor="middle"
        fontSize="18"
        fill={colors.brand800}
      >
        {spec.title}
      </text>
      <text
        x={22}
        y={(plotTop + plotBottom) / 2}
        textAnchor="middle"
        fontSize="12"
        fill={colors.axis}
        transform={`rotate(-90 22 ${(plotTop + plotBottom) / 2})`}
      >
        {spec.yLabel || spec.uom}
      </text>
      <text
        x={(plotLeft + plotRight) / 2}
        y={plotBottom + 48}
        textAnchor="middle"
        fontSize="12"
        fill={colors.axis}
      >
        {spec.xLabel}
      </text>
      {yTicks.map((tick) => (
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
            y={yToPx(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="11"
            fill={colors.axis}
          >
            {formatTick(tick)}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <g key={`x-${tick}`}>
          <line
            x1={xToPx(tick)}
            x2={xToPx(tick)}
            y1={plotTop}
            y2={plotBottom}
            stroke={colors.grid}
          />
          <text
            x={xToPx(tick)}
            y={plotBottom + 16}
            textAnchor="middle"
            fontSize="11"
            fill={colors.axis}
          >
            {formatTick(tick)}
          </text>
        </g>
      ))}
      <polyline
        fill="none"
        stroke={colors.axis}
        strokeWidth="1.25"
        points={`${plotLeft},${plotTop} ${plotLeft},${plotBottom} ${plotRight},${plotBottom}`}
      />
      {specLimits.map((limit) => (
        <line
          key={limit.kind}
          data-testid={`scatter-spec-line-${limit.kind}`}
          x1={plotLeft}
          x2={plotRight}
          y1={limit.lineY}
          y2={limit.lineY}
          stroke={colors.limit}
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
      ))}
      {specLabels.map((label) => (
        <text
          key={label.kind}
          data-testid={`scatter-spec-label-${label.kind}`}
          aria-label={`${label.kind.toUpperCase()} ${label.text}`}
          className="tabular-nums"
          x={label.x}
          y={label.y}
          textAnchor={label.textAnchor}
          fontSize="11"
          fontWeight="600"
          fill={colors.limit}
        >
          {label.text}
        </text>
      ))}
      {geometry.type === "points"
        ? geometry.points.map((point, index) => (
            <circle
              key={`${point.label}-${index}`}
              cx={xToPx(point.x)}
              cy={yToPx(point.y)}
              r="5"
              fill={colorFor(point.series)}
              stroke={colors.plotFill}
              strokeWidth="1"
            >
              <title>
                {spec.layout.xAxis === "value"
                  ? `${point.label}: ${point.x}, ${point.y}`
                  : `${point.label}: ${point.y}`}
              </title>
            </circle>
          ))
        : null}
      {geometry.type === "polylines"
        ? geometry.lines.map((line) => {
            const color = colorFor(line.series || null);
            const d = line.points
              .map((point) => `${xToPx(point.x)},${yToPx(point.y)}`)
              .join(" ");
            const first = line.points[0];
            const last = line.points[line.points.length - 1];
            const baseline = yToPx(Math.max(0, yRange.min));
            const areaD =
              geometry.fill && first && last
                ? `${d} ${xToPx(last.x)},${baseline} ${xToPx(first.x)},${baseline}`
                : null;
            return (
              <g key={`line-${line.series || "series"}`}>
                {areaD ? (
                  <polyline
                    points={areaD}
                    fill={color}
                    fillOpacity="0.18"
                    stroke="none"
                  />
                ) : null}
                {line.points.length >= 2 ? (
                  <polyline
                    points={d}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.25"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null}
                {geometry.markers
                  ? line.points.map((point, index) => (
                      <circle
                        key={`${point.label}-${index}`}
                        cx={xToPx(point.x)}
                        cy={yToPx(point.y)}
                        r="4"
                        fill={color}
                        stroke={colors.plotFill}
                        strokeWidth="1"
                      >
                        <title>
                          {spec.layout.xAxis === "value"
                            ? `${point.label}: ${point.x}, ${point.y}`
                            : `${point.label}: ${point.y}`}
                        </title>
                      </circle>
                    ))
                  : null}
              </g>
            );
          })
        : null}
      {geometry.type === "columns"
        ? geometry.segments.map((segment, index) => {
            const top = yToPx(Math.max(segment.y0, segment.y1));
            const bottom = yToPx(Math.min(segment.y0, segment.y1));
            return (
              <rect
                key={`col-${segment.x}-${segment.series}-${index}`}
                x={xToPx(segment.x) - barWidth / 2}
                y={top}
                width={barWidth}
                height={Math.max(1, bottom - top)}
                fill={colorFor(segment.series || null)}
              />
            );
          })
        : null}
      {showLegend
        ? seriesNames.map((name, index) =>
            name ? (
              <g key={name} transform={`translate(${plotRight + 16} ${plotTop + 8 + index * 20})`}>
                {mark === "column" ? (
                  <rect x="1" y="-5" width="10" height="10" fill={seriesFill(colors, index)} />
                ) : mark === "scatter" ? (
                  <circle cx="6" cy="0" r="5" fill={seriesFill(colors, index)} />
                ) : (
                  <line
                    x1="0"
                    x2="14"
                    y1="0"
                    y2="0"
                    stroke={seriesFill(colors, index)}
                    strokeWidth="2.25"
                    strokeLinecap="round"
                  />
                )}
                <text x="18" y="0" dominantBaseline="middle" fontSize="11" fill={colors.brand800}>
                  {name}
                </text>
              </g>
            ) : null
          )
        : null}
    </svg>
  );
}

export function ScatterView({
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
  analysis: ScatterAnalysisSummary | XyScatterAnalysisSummary;
  reportId: string;
  onPreviewUploaded: (analytics: ReportAnalyticsView) => void;
  onEdit: () => void;
  onRecompute: () => void;
  onDelete: () => void;
  editing?: boolean;
  recomputing?: boolean;
  readOnly?: boolean;
}) {
  const spec = analysis.results.specs[0];
  const xy = isXyScatterAnalysis(analysis);
  const captureRef = useRef<HTMLDivElement>(null);
  useAnalysisPreviewCapture({
    reportId,
    analysis,
    captureRef,
    readOnly,
    onUploaded: onPreviewUploaded,
  });
  const provenance = spec ? formatChartProvenance(spec) : "";
  const subtitle = xy
    ? [
        xyScatterVersusLabel(analysis.config),
        `${analysis.results.n} point${analysis.results.n === 1 ? "" : "s"}`,
        analysis.results.skipped > 0
          ? `${analysis.results.skipped} skipped`
          : null,
        analysis.results.pearsonR == null
          ? null
          : `r = ${formatStat(analysis.results.pearsonR, 3)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : `${analysis.config.query}${provenance ? ` · ${provenance}` : ""}`;
  return (
    <div
      data-testid={xy ? "xy-scatter" : "measurement-scatter"}
      className="flex h-full flex-col gap-3 overflow-auto p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {analysis.stale ? (
            <Badge variant="warning">Stale</Badge>
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
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>

      <div
        ref={captureRef}
        data-testid="analysis-preview-figure"
        className="flex flex-col gap-3 rounded-md bg-[#f4f6f9] p-4"
      >
        <div>
          <h2 className="text-base font-semibold">{analysis.title}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">{subtitle}</p>
        </div>

        <div className="grid gap-4">
          {analysis.results.specs.map((item) => (
            <ScatterChart key={item.title} spec={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
