"use client";

import type { ReactNode } from "react";
import type {
  CapabilitySixpackResult,
  ControlChartSeries,
  CurvePoint,
  HistogramBin,
  ProbabilityPlotPoint,
  SixpackAnalysisSummary,
} from "@/lib/statistical-analysis/types";
import {
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
  analysisDownloadFilename,
  analysisToCsv,
  downloadTextFile,
} from "@/lib/statistical-analysis/download";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <svg
      viewBox="0 0 320 200"
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

const PLOT = { left: 36, right: 308, top: 12, bottom: 168 };

function Axis({
  xMin,
  xMax,
  yMin,
  yMax,
  xLabel,
  yLabel,
}: {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
}) {
  const y = scale(yMin, yMax, PLOT.bottom, PLOT.top);
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  return (
    <g>
      <rect
        x={PLOT.left}
        y={PLOT.top}
        width={PLOT.right - PLOT.left}
        height={PLOT.bottom - PLOT.top}
        fill="transparent"
        stroke="var(--border)"
      />
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={PLOT.left}
            x2={PLOT.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--border)"
            strokeDasharray="2 3"
          />
          <text
            x={PLOT.left - 4}
            y={y(tick) + 3}
            textAnchor="end"
            fontSize="8"
            fill="var(--muted-foreground)"
          >
            {formatLimit(tick)}
          </text>
        </g>
      ))}
      <text
        x={(PLOT.left + PLOT.right) / 2}
        y={192}
        textAnchor="middle"
        fontSize="9"
        fill="var(--muted-foreground)"
      >
        {xLabel}
      </text>
      <text
        x={PLOT.left}
        y={PLOT.bottom + 12}
        fontSize="8"
        fill="var(--muted-foreground)"
      >
        {formatLimit(xMin)}
      </text>
      <text
        x={PLOT.right}
        y={PLOT.bottom + 12}
        textAnchor="end"
        fontSize="8"
        fill="var(--muted-foreground)"
      >
        {formatLimit(xMax)}
      </text>
      <text
        x={12}
        y={(PLOT.top + PLOT.bottom) / 2}
        textAnchor="middle"
        fontSize="9"
        fill="var(--muted-foreground)"
        transform={`rotate(-90 12 ${(PLOT.top + PLOT.bottom) / 2})`}
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
}: {
  series: ControlChartSeries;
  xOffset?: number;
  xLabel: string;
  yLabel: string;
  ariaLabel: string;
}) {
  const xs = series.values.map((_, i) => i + xOffset);
  const [yMin, yMax] = domain(
    [...series.values, series.ucl, series.lcl, series.center],
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
        y1={y(series.center)}
        y2={y(series.center)}
        stroke="var(--brand-600)"
      />
      <line
        x1={PLOT.left}
        x2={PLOT.right}
        y1={y(series.lcl)}
        y2={y(series.lcl)}
        stroke="var(--destructive)"
        strokeDasharray="4 3"
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
    </ChartSvg>
  );
}

function HistogramChart({
  bins,
  overallCurve,
  withinCurve,
  lsl,
  usl,
}: {
  bins: HistogramBin[];
  overallCurve: CurvePoint[];
  withinCurve: CurvePoint[];
  lsl: number | null;
  usl: number | null;
}) {
  const counts = bins.map((bin) => bin.count);
  const curveYs = [...overallCurve, ...withinCurve].map((point) => point.y);
  const xValues = [
    ...bins.map((bin) => bin.x0),
    ...bins.map((bin) => bin.x1),
    ...overallCurve.map((point) => point.x),
    lsl ?? Number.POSITIVE_INFINITY,
    usl ?? Number.NEGATIVE_INFINITY,
  ].filter((value) => Number.isFinite(value));
  const [xMin, xMax] = domain(xValues, 0.02);
  const yMax = Math.max(1, ...counts, ...curveYs) * 1.12;
  const x = scale(xMin, xMax, PLOT.left, PLOT.right);
  const y = scale(0, yMax, PLOT.bottom, PLOT.top);

  const toPath = (points: CurvePoint[]) =>
    points
      .map(
        (point, i) => `${i === 0 ? "M" : "L"} ${x(point.x)} ${y(point.y)}`
      )
      .join(" ");

  return (
    <ChartSvg ariaLabel="Capability histogram">
      <Axis
        xMin={xMin}
        xMax={xMax}
        yMin={0}
        yMax={yMax}
        xLabel="Measurement"
        yLabel="Frequency"
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
      {lsl != null ? (
        <line
          x1={x(lsl)}
          x2={x(lsl)}
          y1={PLOT.top}
          y2={PLOT.bottom}
          stroke="var(--destructive)"
          strokeDasharray="3 2"
        />
      ) : null}
      {usl != null ? (
        <line
          x1={x(usl)}
          x2={x(usl)}
          y1={PLOT.top}
          y2={PLOT.bottom}
          stroke="var(--destructive)"
          strokeDasharray="3 2"
        />
      ) : null}
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
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <dt className="text-[11px] text-[var(--muted-foreground)]">{label}</dt>
      <dd
        data-testid={testId}
        className="text-[11px] font-medium tabular-nums"
      >
        {value}
      </dd>
    </div>
  );
}

function CapabilitySummary({ result }: { result: CapabilitySixpackResult }) {
  const cap = result.capability;
  return (
    <div className="grid h-full grid-cols-2 gap-x-4 gap-y-2 overflow-auto px-1 text-xs">
      <dl>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
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
        <StatRow label="Mean" value={formatStat(result.mean)} />
        <StatRow label="StDev (overall)" value={formatStat(result.overallStdev)} />
        <StatRow label="StDev (within)" value={formatStat(result.withinStdev)} />
        <StatRow label="MR̄" value={formatStat(result.mrBar)} />
        <StatRow label="LSL" value={formatStat(cap.lsl)} />
        <StatRow label="Target" value={formatStat(cap.target)} />
        <StatRow label="USL" value={formatStat(cap.usl)} />
      </dl>
      <div>
        <dl>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Potential (within)
          </p>
          <StatRow label="Cp" value={formatStat(cap.cp)} />
          <StatRow label="CPL" value={formatStat(cap.cpl)} />
          <StatRow label="CPU" value={formatStat(cap.cpu)} />
          <StatRow label="Cpk" value={formatStat(cap.cpk)} />
          <StatRow label="PPM (exp.)" value={formatPpm(cap.ppmWithin)} />
        </dl>
        <dl className="mt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Overall
          </p>
          <StatRow label="Pp" value={formatStat(cap.pp)} />
          <StatRow label="PPL" value={formatStat(cap.ppl)} />
          <StatRow label="PPU" value={formatStat(cap.ppu)} />
          <StatRow label="Ppk" value={formatStat(cap.ppk)} />
          <StatRow label="PPM (exp.)" value={formatPpm(cap.ppmOverall)} />
          <StatRow label="PPM (obs.)" value={formatPpm(cap.ppmObserved)} />
        </dl>
      </div>
    </div>
  );
}

export function SixpackView({
  analysis,
  onRecompute,
  onDelete,
  recomputing,
  readOnly = false,
}: {
  analysis: SixpackAnalysisSummary;
  onRecompute: () => void;
  onDelete: () => void;
  recomputing: boolean;
  readOnly?: boolean;
}) {
  const { results, config, stale, title } = analysis;
  const rowLabel = formatRowSelection(normalizeRowSelection(config));
  return (
    <div data-testid="capability-sixpack" className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <div className="flex items-center gap-2">
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
                {recomputing ? "Recomputing…" : "Recompute"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {stale ? (
        <p
          data-testid="sixpack-stale-banner"
          className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          Worksheet data changed after this analysis. Recompute to refresh the
          sixpack; the stored result is unchanged until you do.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="I Chart">
          <ControlChart
            series={results.individuals}
            xLabel="Observation"
            yLabel="Individual"
            ariaLabel="Individuals control chart"
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
          />
        </Panel>
        <Panel title="Capability Histogram">
          <HistogramChart
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
  );
}
