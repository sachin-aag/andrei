"use client";

import { useRef, type ReactNode } from "react";
import type {
  CapabilitySixpackResult,
  ControlChartSeries,
  CurvePoint,
  HistogramBin,
  ProbabilityPlotPoint,
  ReportAnalyticsView,
  SixpackAnalysisSummary,
} from "@/lib/statistical-analysis/types";
import { useAnalysisPreviewCapture } from "@/hooks/use-analysis-preview-capture";
import {
  formatAxisTick,
  xTickAnchor,
} from "@/lib/charts/axis-ticks";
import {
  HISTOGRAM_CHART_HEIGHT,
  HISTOGRAM_CHART_WIDTH,
  HISTOGRAM_PLOT,
  HISTOGRAM_TITLE_Y,
} from "@/lib/statistical-analysis/histogram-chart-layout";
import { histogramChartScale } from "@/lib/statistical-analysis/histogram-chart-scale";
import {
  formatCapabilityStat,
  formatLimit,
  formatPpm,
  formatPValue,
  formatStat,
} from "@/lib/statistical-analysis/format";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import {
  layoutControlLimitLabels,
  layoutHorizontalSpecLabels,
  layoutSpecLimitLabels,
  type ControlLimitInput,
  type HorizontalLimitEdge,
  type SpecLimitInput,
} from "@/lib/statistical-analysis/spec-limit-labels";
import { downloadAnalysisFigure } from "@/lib/statistical-analysis/download-figure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnalysisRecomputeButton } from "@/components/statistical-analysis/analysis-recompute-button";

function domain(values: number[], pad = 0.08): [number, number] {
  if (values.length === 0) return [-1, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  return [min - span * pad, max + span * pad];
}

function scale(min: number, max: number, start: number, end: number) {
  const span = max - min || 1;
  return (value: number) => start + ((value - min) / span) * (end - start);
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-[220px] flex-col rounded-md border border-[var(--border)] bg-[var(--card)] p-2">
      <h3 className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-[var(--foreground)]">
        {title}
      </h3>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function ChartSvg({
  children,
  ariaLabel,
  width = 320,
  height = 200,
}: {
  children: ReactNode;
  ariaLabel: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={ariaLabel}
      className="overflow-visible"
    >
      {children}
    </svg>
  );
}

type PlotBox = { left: number; right: number; top: number; bottom: number };

const PLOT: PlotBox = { left: 36, right: 308, top: 12, bottom: 168 };
const HISTOGRAM_FULL = {
  width: HISTOGRAM_CHART_WIDTH,
  height: HISTOGRAM_CHART_HEIGHT,
  plot: HISTOGRAM_PLOT satisfies PlotBox,
};

function LimitLabel({
  testId,
  name,
  x,
  y,
  textAnchor,
  text,
  plot = PLOT,
}: {
  testId: string;
  name: string;
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
  text: string;
  plot?: PlotBox;
}) {
  const insidePlot = y > plot.top && y < plot.bottom;
  return (
    <text
      data-testid={testId}
      className="tabular-nums"
      x={x}
      y={y}
      textAnchor={textAnchor}
      fontSize="8"
      fontWeight="600"
      fill="var(--destructive)"
      stroke={insidePlot ? "var(--card)" : undefined}
      strokeWidth={insidePlot ? 3 : undefined}
      paintOrder={insidePlot ? "stroke" : undefined}
      aria-label={`${name} ${text}`}
    >
      {text}
    </text>
  );
}

function Axis({
  xMin,
  xMax,
  yMin,
  yMax,
  xLabel,
  yLabel,
  plot = PLOT,
  viewHeight = 200,
  xTicks,
  yTicks,
  tickFontSize = 8,
  labelFontSize = 9,
  formatTick = formatLimit,
  tickTestIdPrefix,
}: {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  plot?: PlotBox;
  viewHeight?: number;
  xTicks?: number[];
  yTicks?: number[];
  tickFontSize?: number;
  labelFontSize?: number;
  formatTick?: (value: number) => string;
  tickTestIdPrefix?: string;
}) {
  const x = scale(xMin, xMax, plot.left, plot.right);
  const y = scale(yMin, yMax, plot.bottom, plot.top);
  const xs = xTicks ?? [xMin, (xMin + xMax) / 2, xMax];
  const ys = yTicks ?? [yMin, (yMin + yMax) / 2, yMax];
  const yLabelX = plot.left <= 40 ? 12 : 16;
  const yLabelY = (plot.top + plot.bottom) / 2;
  return (
    <g>
      <rect
        x={plot.left}
        y={plot.top}
        width={plot.right - plot.left}
        height={plot.bottom - plot.top}
        fill="transparent"
        stroke="var(--border)"
      />
      {ys.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={plot.left}
            x2={plot.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--border)"
            strokeDasharray="2 3"
          />
          <text
            data-testid={
              tickTestIdPrefix ? `${tickTestIdPrefix}-y-tick` : undefined
            }
            x={plot.left - 4}
            y={y(tick) + 3}
            textAnchor="end"
            fontSize={tickFontSize}
            fill="var(--muted-foreground)"
          >
            {formatTick(tick)}
          </text>
        </g>
      ))}
      {xs.map((tick, index) => (
        <text
          key={`x-${tick}`}
          data-testid={
            tickTestIdPrefix ? `${tickTestIdPrefix}-x-tick` : undefined
          }
          x={x(tick)}
          y={plot.bottom + (tickFontSize >= 10 ? 14 : 12)}
          textAnchor={xTickAnchor(index, xs.length)}
          fontSize={tickFontSize}
          fill="var(--muted-foreground)"
        >
          {formatTick(tick)}
        </text>
      ))}
      <text
        x={(plot.left + plot.right) / 2}
        y={viewHeight - 8}
        textAnchor="middle"
        fontSize={labelFontSize}
        fill="var(--muted-foreground)"
      >
        {xLabel}
      </text>
      <text
        x={yLabelX}
        y={yLabelY}
        textAnchor="middle"
        fontSize={labelFontSize}
        fill="var(--muted-foreground)"
        transform={`rotate(-90 ${yLabelX} ${yLabelY})`}
      >
        {yLabel}
      </text>
    </g>
  );
}

function ControlChart({
  series,
  xOffset = 1,
  xLabel,
  yLabel,
  ariaLabel,
  chartTestId,
  lsl = null,
  usl = null,
  showControlLimits = true,
}: {
  series: ControlChartSeries;
  xOffset?: number;
  xLabel: string;
  yLabel: string;
  ariaLabel: string;
  chartTestId: string;
  lsl?: number | null;
  usl?: number | null;
  showControlLimits?: boolean;
}) {
  const xs = series.values.map((_, i) => i + xOffset);
  const specValues = [lsl, usl].filter(
    (value): value is number => value != null && Number.isFinite(value)
  );
  const [yMin, yMax] = domain(
    [
      ...series.values,
      series.center,
      ...(showControlLimits ? [series.ucl, series.lcl] : []),
      ...specValues,
    ],
    0.12
  );
  const xMin = (xs[0] ?? 1) - 0.5;
  const xMax = (xs[xs.length - 1] ?? 1) + 0.5;
  const x = scale(xMin, xMax, PLOT.left, PLOT.right);
  const y = scale(yMin, yMax, PLOT.bottom, PLOT.top);
  const ooc = new Set(series.outOfControl);
  const path = series.values
    .map((value, i) => `${i === 0 ? "M" : "L"} ${x(xs[i]!)} ${y(value)}`)
    .join(" ");
  const controlLimits: ControlLimitInput[] = showControlLimits
    ? [
        { kind: "ucl", value: series.ucl, lineY: y(series.ucl) },
        { kind: "lcl", value: series.lcl, lineY: y(series.lcl) },
      ]
    : [];
  const controlLabels = layoutControlLimitLabels(controlLimits, PLOT);
  const specEdge: HorizontalLimitEdge = showControlLimits ? "left" : "right";
  const specLabels = layoutHorizontalSpecLabels(
    [
      ...(lsl != null
        ? [{ kind: "lsl" as const, value: lsl, lineY: y(lsl), edge: specEdge }]
        : []),
      ...(usl != null
        ? [{ kind: "usl" as const, value: usl, lineY: y(usl), edge: specEdge }]
        : []),
    ],
    PLOT
  );

  return (
    <ChartSvg ariaLabel={ariaLabel}>
      <Axis
        xMin={xMin}
        xMax={xMax}
        yMin={yMin}
        yMax={yMax}
        xLabel={xLabel}
        yLabel={yLabel}
      />
      {specValues.map((value) => (
        <line
          key={`spec-${value}`}
          x1={PLOT.left}
          x2={PLOT.right}
          y1={y(value)}
          y2={y(value)}
          stroke="var(--destructive)"
          strokeDasharray="3 2"
        />
      ))}
      {showControlLimits ? (
        <>
          <line
            x1={PLOT.left}
            x2={PLOT.right}
            y1={y(series.ucl)}
            y2={y(series.ucl)}
            stroke="var(--destructive)"
            strokeDasharray="4 3"
          />
          <line
            x1={PLOT.left}
            x2={PLOT.right}
            y1={y(series.lcl)}
            y2={y(series.lcl)}
            stroke="var(--destructive)"
            strokeDasharray="4 3"
          />
        </>
      ) : null}
      <line
        x1={PLOT.left}
        x2={PLOT.right}
        y1={y(series.center)}
        y2={y(series.center)}
        stroke="var(--brand-600)"
      />
      <path d={path} fill="none" stroke="var(--foreground)" strokeWidth="1.1" />
      {series.values.map((value, i) => (
        <circle
          key={xs[i]}
          cx={x(xs[i]!)}
          cy={y(value)}
          r={ooc.has(i) ? 3.2 : 2.2}
          fill={ooc.has(i) ? "var(--destructive)" : "var(--brand-600)"}
        />
      ))}
      {controlLabels.map((label) => (
        <LimitLabel
          key={label.kind}
          testId={`sixpack-${chartTestId}-label-${label.kind}`}
          name={label.kind.toUpperCase()}
          x={label.x}
          y={label.y}
          textAnchor={label.textAnchor}
          text={label.text}
        />
      ))}
      {specLabels.map((label) => (
        <LimitLabel
          key={label.kind}
          testId={`sixpack-${chartTestId}-label-${label.kind}`}
          name={label.kind.toUpperCase()}
          x={label.x}
          y={label.y}
          textAnchor={label.textAnchor}
          text={label.text}
        />
      ))}
    </ChartSvg>
  );
}

export function CapabilityHistogramChart({
  bins,
  overallCurve,
  withinCurve,
  lsl,
  usl,
  showDistributionLines = true,
  showLsl = true,
  showUsl = true,
  title,
  testIdPrefix = "sixpack",
  size = "compact",
}: {
  bins: HistogramBin[];
  overallCurve: CurvePoint[];
  withinCurve: CurvePoint[];
  lsl: number | null;
  usl: number | null;
  showDistributionLines?: boolean;
  showLsl?: boolean;
  showUsl?: boolean;
  title?: string;
  testIdPrefix?: string;
  size?: "compact" | "full";
}) {
  const drawLsl = showLsl && lsl != null;
  const drawUsl = showUsl && usl != null;
  const layout =
    size === "full"
      ? HISTOGRAM_FULL
      : { width: 320, height: 200, plot: PLOT };
  const plot = layout.plot;
  const scaleBox = histogramChartScale({
    bins,
    overallCurve,
    withinCurve,
    lsl,
    usl,
    showDistributionLines,
    showLsl,
    showUsl,
  });
  const x = scale(scaleBox.xMin, scaleBox.xMax, plot.left, plot.right);
  const y = scale(scaleBox.yMin, scaleBox.yMax, plot.bottom, plot.top);
  const specLimits: SpecLimitInput[] = [
    ...(drawLsl ? [{ kind: "lsl" as const, value: lsl, lineX: x(lsl) }] : []),
    ...(drawUsl ? [{ kind: "usl" as const, value: usl, lineX: x(usl) }] : []),
  ];
  const specLabels = layoutSpecLimitLabels(specLimits, plot);
  const full = size === "full";

  const toPath = (points: CurvePoint[]) =>
    points
      .map(
        (point, i) => `${i === 0 ? "M" : "L"} ${x(point.x)} ${y(point.y)}`
      )
      .join(" ");

  return (
    <ChartSvg
      ariaLabel={title || "Capability histogram"}
      width={layout.width}
      height={layout.height}
    >
      {title ? (
        <text
          data-testid={`${testIdPrefix}-chart-title`}
          x={(plot.left + plot.right) / 2}
          y={HISTOGRAM_TITLE_Y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={full ? 14 : 11}
          fontWeight="600"
          fill="currentColor"
        >
          {title}
        </text>
      ) : null}
      <Axis
        xMin={scaleBox.xMin}
        xMax={scaleBox.xMax}
        yMin={scaleBox.yMin}
        yMax={scaleBox.yMax}
        xLabel="Measurement"
        yLabel="Frequency"
        plot={plot}
        viewHeight={layout.height}
        xTicks={scaleBox.xTicks}
        yTicks={scaleBox.yTicks}
        tickFontSize={full ? 10 : 8}
        labelFontSize={full ? 11 : 9}
        formatTick={formatAxisTick}
        tickTestIdPrefix={testIdPrefix}
      />
      {bins.map((bin) => {
        const width = Math.max(0.5, x(bin.x1) - x(bin.x0) - 1);
        return (
          <rect
            key={`${bin.x0}-${bin.x1}`}
            x={x(bin.x0)}
            y={y(bin.count)}
            width={width}
            height={Math.max(0, y(0) - y(bin.count))}
            fill="var(--brand-200)"
            stroke="var(--brand-500)"
            strokeWidth="0.6"
          />
        );
      })}
      {showDistributionLines ? (
        <>
          <path
            d={toPath(withinCurve)}
            fill="none"
            stroke="var(--brand-600)"
            strokeWidth="1.3"
          />
          <path
            d={toPath(overallCurve)}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
        </>
      ) : null}
      {specLimits.map((limit) => (
        <line
          key={limit.kind}
          x1={limit.lineX}
          x2={limit.lineX}
          y1={plot.top}
          y2={plot.bottom}
          stroke="var(--destructive)"
          strokeDasharray="3 2"
        />
      ))}
      {specLabels.map((label) => (
        <LimitLabel
          key={label.kind}
          testId={`${testIdPrefix}-spec-label-${label.kind}`}
          name={label.kind.toUpperCase()}
          x={label.x}
          y={label.y}
          textAnchor={label.textAnchor}
          text={label.text}
          plot={plot}
        />
      ))}
    </ChartSvg>
  );
}

function NormalPlot({
  points,
  lineStart,
  lineEnd,
  lowerBand,
  upperBand,
  ad,
  pValue,
}: {
  points: ProbabilityPlotPoint[];
  lineStart: ProbabilityPlotPoint;
  lineEnd: ProbabilityPlotPoint;
  lowerBand: ProbabilityPlotPoint[];
  upperBand: ProbabilityPlotPoint[];
  ad: number;
  pValue: number;
}) {
  const zs = [
    ...points.map((point) => point.z),
    lineStart.z,
    lineEnd.z,
    ...lowerBand.map((point) => point.z),
  ];
  const ys = [
    ...points.map((point) => point.value),
    lineStart.value,
    lineEnd.value,
    ...lowerBand.map((point) => point.value),
    ...upperBand.map((point) => point.value),
  ];
  const [xMin, xMax] = domain(zs, 0.08);
  const [yMin, yMax] = domain(ys, 0.08);
  const x = scale(xMin, xMax, PLOT.left, PLOT.right);
  const y = scale(yMin, yMax, PLOT.bottom, PLOT.top);
  const band = [
    ...lowerBand.map((point) => `${x(point.z)},${y(point.value)}`),
    ...upperBand
      .toReversed()
      .map((point) => `${x(point.z)},${y(point.value)}`),
  ].join(" ");

  return (
    <ChartSvg ariaLabel="Normal probability plot">
      <Axis
        xMin={xMin}
        xMax={xMax}
        yMin={yMin}
        yMax={yMax}
        xLabel="Normal score"
        yLabel="Value"
      />
      {band.length > 0 ? (
        <polygon points={band} fill="var(--brand-100)" opacity="0.7" />
      ) : null}
      <line
        x1={x(lineStart.z)}
        y1={y(lineStart.value)}
        x2={x(lineEnd.z)}
        y2={y(lineEnd.value)}
        stroke="var(--brand-600)"
        strokeWidth="1.3"
      />
      {points.map((point) => (
        <circle
          key={`${point.z}-${point.value}`}
          cx={x(point.z)}
          cy={y(point.value)}
          r="2.2"
          fill="var(--foreground)"
        />
      ))}
      <text x={PLOT.left + 6} y={PLOT.top + 12} fontSize="9" fill="var(--foreground)">
        AD: {formatStat(ad, 3)}   P: {formatPValue(pValue)}
      </text>
    </ChartSvg>
  );
}

function StatRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <dt className="min-w-0 pr-1 text-[11px] text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd
        data-testid={testId}
        className="shrink-0 whitespace-nowrap text-[11px] font-medium tabular-nums"
      >
        {value}
      </dd>
    </div>
  );
}

function CapabilitySummary({ result }: { result: CapabilitySixpackResult }) {
  const cap = result.capability;
  return (
    <div className="grid h-full grid-cols-2 gap-x-3 gap-y-2 overflow-auto px-1 text-xs">
      <dl>
        <p className="mb-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Process data
        </p>
        <StatRow
          label="Sample N"
          value={String(result.n)}
          testId="sixpack-sample-n"
        />
        {result.skipped > 0 ? (
          <StatRow label="Skipped" value={String(result.skipped)} />
        ) : null}
        <StatRow
          label="Mean"
          value={formatCapabilityStat(result.mean)}
          testId="sixpack-mean"
        />
        <StatRow
          label="StDev (overall)"
          value={formatCapabilityStat(result.overallStdev)}
          testId="sixpack-stdev-overall"
        />
        <StatRow
          label="StDev (within)"
          value={formatCapabilityStat(result.withinStdev)}
          testId="sixpack-stdev-within"
        />
        <StatRow label="MR̄" value={formatCapabilityStat(result.mrBar)} />
        <StatRow label="LSL" value={formatCapabilityStat(cap.lsl)} />
        <StatRow label="Target" value={formatCapabilityStat(cap.target)} />
        <StatRow label="USL" value={formatCapabilityStat(cap.usl)} />
      </dl>
      <div>
        <dl>
          <p className="mb-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Potential (within)
          </p>
          <StatRow label="Cp" value={formatCapabilityStat(cap.cp)} />
          <StatRow label="CPL" value={formatCapabilityStat(cap.cpl)} />
          <StatRow label="CPU" value={formatCapabilityStat(cap.cpu)} />
          <StatRow label="Cpk" value={formatCapabilityStat(cap.cpk)} />
          <StatRow label="PPM (exp.)" value={formatPpm(cap.ppmWithin)} />
        </dl>
        <dl className="mt-2">
          <p className="mb-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Overall
          </p>
          <StatRow label="Pp" value={formatCapabilityStat(cap.pp)} />
          <StatRow label="PPL" value={formatCapabilityStat(cap.ppl)} />
          <StatRow label="PPU" value={formatCapabilityStat(cap.ppu)} />
          <StatRow label="Ppk" value={formatCapabilityStat(cap.ppk)} />
          <StatRow label="PPM (exp.)" value={formatPpm(cap.ppmOverall)} />
          <StatRow label="PPM (obs.)" value={formatPpm(cap.ppmObserved)} />
        </dl>
      </div>
    </div>
  );
}

export function SixpackView({
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
  analysis: SixpackAnalysisSummary;
  reportId: string;
  onPreviewUploaded: (analytics: ReportAnalyticsView) => void;
  onEdit: () => void;
  onRecompute: () => void;
  onDelete: () => void;
  editing?: boolean;
  recomputing?: boolean;
  readOnly?: boolean;
}) {
  const { results, config, stale, title } = analysis;
  const rowLabel = formatRowSelection(normalizeRowSelection(config));
  const captureRef = useRef<HTMLDivElement>(null);
  useAnalysisPreviewCapture({
    reportId,
    analysis,
    captureRef,
    readOnly,
    onUploaded: onPreviewUploaded,
  });

  return (
    <div data-testid="capability-sixpack" className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {stale ? (
            <Badge data-testid="sixpack-stale-badge" variant="warning">
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
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>

      {stale ? (
        <p
          data-testid="sixpack-stale-banner"
          className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          Worksheet data changed after this analysis. Recompute to refresh the
          plot with current data, or Edit to change the analysis settings.
        </p>
      ) : null}

      <div
        ref={captureRef}
        data-testid="analysis-preview-figure"
        className="flex flex-col gap-3 rounded-md bg-[#f4f6f9] p-4"
      >
        <div>
          <h2 className="text-base font-semibold">
            Process Capability Sixpack of {config.columnName}
          </h2>
          <p
            className="text-xs text-[var(--muted-foreground)]"
            data-testid="sixpack-row-range"
          >
            {title} · Normal · Individuals / I-MR
            {rowLabel ? ` · ${rowLabel}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Panel title="I Chart">
            <ControlChart
              series={results.individuals}
              xLabel="Observation"
              yLabel="Individual"
              ariaLabel="Individuals control chart"
              chartTestId="ichart"
              lsl={results.capability.lsl}
              usl={results.capability.usl}
            />
          </Panel>
          <Panel title="Last 25 Observations">
            <ControlChart
              series={{
                values: results.lastObservations,
                center: results.mean,
                ucl: results.individuals.ucl,
                lcl: results.individuals.lcl,
                outOfControl: [],
              }}
              xOffset={Math.max(1, results.n - results.lastObservations.length + 1)}
              xLabel="Observation"
              yLabel="Value"
              ariaLabel="Last 25 observations"
              chartTestId="last25"
              lsl={results.capability.lsl}
              usl={results.capability.usl}
              showControlLimits={false}
            />
          </Panel>
          <Panel title="Capability Histogram">
            <CapabilityHistogramChart
              bins={results.histogram.bins}
              overallCurve={results.histogram.overallCurve}
              withinCurve={results.histogram.withinCurve}
              lsl={results.capability.lsl}
              usl={results.capability.usl}
            />
          </Panel>
          <Panel title="Moving Range Chart">
            <ControlChart
              series={results.movingRange}
              xOffset={2}
              xLabel="Observation"
              yLabel="Moving range"
              ariaLabel="Moving range control chart"
              chartTestId="mr"
            />
          </Panel>
          <Panel title="Normal Probability Plot">
            <NormalPlot
              points={results.normalPlot.points}
              lineStart={results.normalPlot.lineStart}
              lineEnd={results.normalPlot.lineEnd}
              lowerBand={results.normalPlot.lowerBand}
              upperBand={results.normalPlot.upperBand}
              ad={results.normalPlot.ad}
              pValue={results.normalPlot.pValue}
            />
          </Panel>
          <Panel title="Process Capability">
            <CapabilitySummary result={results} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
