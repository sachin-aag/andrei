"use client";

import type { ScatterAnalysisSummary } from "@/lib/statistical-analysis/types";
import {
  analysisDownloadFilename,
  analysisToCsv,
  downloadTextFile,
} from "@/lib/statistical-analysis/download";
import {
  formatChartProvenance,
  layoutPoints,
  resolveYRange,
  yTickValues,
  type ChartPoint,
  type ChartSpec,
} from "@/lib/charts/chart-spec";
import { chartBrandColors, seriesFill } from "@/lib/charts/brand-colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const seriesNames = uniqueSeries(points);
  const showLegend = spec.layout.seriesBy === "unit" && seriesNames.some((name) => name);
  const legendWidth = showLegend ? 168 : 0;
  const plotLeft = 88;
  const plotRight = WIDTH - 28 - legendWidth;
  const plotTop = 64;
  const plotBottom = HEIGHT - 72;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const xs = points.map((point) => point.x);
  const rawMin = Math.min(...xs);
  const rawMax = Math.max(...xs);
  const xMin = rawMin - 0.5;
  const xMax = rawMax + 0.5;
  const xSpan = Math.max(1, xMax - xMin);
  const xToPx = (x: number) => plotLeft + ((x - xMin) / xSpan) * plotWidth;
  const yToPx = (y: number) =>
    plotBottom - ((y - yRange.min) / (yRange.max - yRange.min)) * plotHeight;
  const seriesIndex = new Map(seriesNames.map((name, index) => [name, index]));
  const xTickMin = Math.round(rawMin);
  const xTickMax = Math.round(rawMax);
  const xTickStep = xTickMax <= 15 ? 1 : xTickMax <= 40 ? 5 : 10;
  const xTicks: number[] = [];
  for (let x = xTickMin; x <= xTickMax; x += xTickStep) xTicks.push(x);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={spec.title}
      data-testid="measurement-scatter-chart"
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
            {tick}
          </text>
        </g>
      ))}
      <polyline
        fill="none"
        stroke={colors.axis}
        strokeWidth="1.25"
        points={`${plotLeft},${plotTop} ${plotLeft},${plotBottom} ${plotRight},${plotBottom}`}
      />
      {[spec.limits.lower, spec.limits.upper].map((limit, index) =>
        limit == null ? null : (
          <line
            key={`limit-${index}`}
            x1={plotLeft}
            x2={plotRight}
            y1={yToPx(limit)}
            y2={yToPx(limit)}
            stroke={colors.limit}
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
        )
      )}
      {points.map((point, index) => {
        const color =
          spec.layout.seriesBy === "unit"
            ? seriesFill(colors, seriesIndex.get(point.series ?? "") ?? 0)
            : colors.brand600;
        return (
          <circle
            key={`${point.label}-${index}`}
            cx={xToPx(point.x)}
            cy={yToPx(point.y)}
            r="5"
            fill={color}
            stroke={colors.plotFill}
            strokeWidth="1"
          >
            <title>{`${point.label}: ${point.y}`}</title>
          </circle>
        );
      })}
      {showLegend
        ? seriesNames.map((name, index) =>
            name ? (
              <g key={name} transform={`translate(${plotRight + 16} ${plotTop + 8 + index * 20})`}>
                <circle cx="6" cy="0" r="5" fill={seriesFill(colors, index)} />
                <text x="16" y="0" dominantBaseline="middle" fontSize="11" fill={colors.brand800}>
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
  onRecompute,
  onDelete,
  recomputing,
  readOnly = false,
}: {
  analysis: ScatterAnalysisSummary;
  onRecompute: () => void;
  onDelete: () => void;
  recomputing: boolean;
  readOnly?: boolean;
}) {
  const spec = analysis.results.specs[0];
  const provenance = spec ? formatChartProvenance(spec) : "";
  return (
    <div
      data-testid="measurement-scatter"
      className="flex h-full flex-col gap-3 overflow-auto p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{analysis.title}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            {analysis.config.query}
            {provenance ? ` · ${provenance}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {analysis.stale ? (
            <Badge variant="warning">Stale</Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="download-analysis"
            onClick={() => {
              downloadTextFile(
                analysisDownloadFilename(analysis),
                analysisToCsv(analysis)
              );
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
                disabled={recomputing}
                onClick={onRecompute}
              >
                {recomputing ? "Extracting…" : "Recompute"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {analysis.results.specs.map((item) => (
          <ScatterChart key={item.title} spec={item} />
        ))}
      </div>
    </div>
  );
}
