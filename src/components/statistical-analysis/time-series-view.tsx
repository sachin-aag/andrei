"use client";

import { useRef } from "react";
import { AnalysisRecomputeButton } from "@/components/statistical-analysis/analysis-recompute-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnalysisPreviewCapture } from "@/hooks/use-analysis-preview-capture";
import {
  axisTickValues,
  formatAxisTick,
  formatTimeAxisTick,
  niceAxisDomain,
  xTickAnchor,
} from "@/lib/charts/axis-ticks";
import { chartBrandColors } from "@/lib/charts/brand-colors";
import { downloadAnalysisFigure } from "@/lib/statistical-analysis/download-figure";
import { formatStat } from "@/lib/statistical-analysis/format";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import { timeSeriesOverlays } from "@/lib/statistical-analysis/types";
import {
  suspectBands,
  worstExcursion,
} from "@/lib/statistical-analysis/time-series";
import type {
  ReportAnalyticsView,
  TimeSeriesAnalysisSummary,
  TimeSeriesBandSegment,
  TimeSeriesExcursion,
  TimeSeriesPoint,
} from "@/lib/statistical-analysis/types";

const WIDTH = 960;
const HEIGHT = 420;
const PAD = { top: 28, right: 24, bottom: 52, left: 68 };

export function TimeSeriesView({
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
  analysis: TimeSeriesAnalysisSummary;
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
  const overlays = timeSeriesOverlays(config);
  const rowLabel = formatRowSelection(normalizeRowSelection(config));
  // A band is a specification the figure cannot verify — but it can say when
  // one could never have failed.
  const suspect = suspectBands(config, results);

  return (
    <div
      data-testid="time-series"
      className="flex h-full flex-col gap-3 overflow-auto p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-[var(--muted-foreground)]">
          {rowLabel ? `${rowLabel} · ` : ""}n = {results.n}
          {results.skipped > 0 ? ` · skipped ${results.skipped}` : ""} · mean{" "}
          {formatStat(results.mean)} · range {formatStat(results.min)}–
          {formatStat(results.max)}
          {results.decimated ? " · plotted sample" : ""}
        </p>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 sm:min-w-[18rem]">
          <div className="flex flex-wrap items-center gap-2">
            {stale ? (
              <Badge data-testid="time-series-stale-badge" variant="warning">
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
        <TimeSeriesChart
          title={title}
          xLabel={config.timeColumnName}
          yLabel={config.columnName}
          points={results.points}
          bands={overlays.showSpecLimits ? results.bandSegments : []}
          excursions={overlays.showExcursions ? results.excursions : []}
        />
      </div>

      {suspect.length > 0 ? (
        <ul
          className="space-y-1 text-sm text-[var(--destructive)]"
          data-testid="time-series-suspect-bands"
        >
          {suspect.map((band) => (
            <li key={`${band.reason}-${band.when}`}>{band.message}</li>
          ))}
        </ul>
      ) : null}

      <ExcursionTable
        excursions={results.excursions}
        conditionLabel={config.conditionColumnName ?? null}
        excursionReadings={results.excursionReadings}
        judgedReadings={results.judgedReadings}
      />
    </div>
  );
}

export function TimeSeriesChart({
  title,
  xLabel,
  yLabel,
  points,
  bands,
  excursions,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  points: readonly TimeSeriesPoint[];
  bands: readonly TimeSeriesBandSegment[];
  excursions: readonly TimeSeriesExcursion[];
}) {
  const colors = chartBrandColors();
  if (points.length === 0) {
    return (
      <p className="p-6 text-sm text-[var(--muted-foreground)]">
        No readings to plot.
      </p>
    );
  }

  const xs = points.map((point) => point.t);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const span = Math.max(1, xMax - xMin);

  // The band belongs in the y domain: a reading inside limits that sit off the
  // plotted range would look compliant against an invisible line.
  const ys = points.map((point) => point.value);
  const bandValues = bands.flatMap((band) =>
    [band.lsl, band.usl].filter((value): value is number => value != null)
  );
  const domain = niceAxisDomain(Math.min(...ys, ...bandValues), Math.max(...ys, ...bandValues));

  const xToPx = (t: number) =>
    PAD.left + ((t - xMin) / span) * (WIDTH - PAD.left - PAD.right);
  const yToPx = (value: number) =>
    HEIGHT -
    PAD.bottom -
    ((value - domain.min) / Math.max(1e-9, domain.max - domain.min)) *
      (HEIGHT - PAD.top - PAD.bottom);

  const xTicks = axisTickValues(xMin, xMax);
  const yTicks = axisTickValues(domain.min, domain.max);
  const line = points.map((point) => `${xToPx(point.t)},${yToPx(point.value)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label={title}
      data-testid="time-series-chart"
    >
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill={colors.plotFill} />
      <text
        x={WIDTH / 2}
        y={18}
        textAnchor="middle"
        fontSize="14"
        fontWeight="600"
        fill={colors.foreground}
      >
        {title}
      </text>

      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={yToPx(tick)}
            y2={yToPx(tick)}
            stroke={colors.grid}
            strokeWidth="1"
          />
          <text
            x={PAD.left - 8}
            y={yToPx(tick) + 4}
            textAnchor="end"
            fontSize="11"
            fill={colors.axis}
          >
            {formatAxisTick(tick)}
          </text>
        </g>
      ))}

      {/* Acceptance band. Drawn per segment so a band that steps with the
          recorded setpoint is shown stepping, not averaged into one pair. */}
      {bands.map((band, index) => {
        const top = band.usl != null ? yToPx(band.usl) : PAD.top;
        const bottom = band.lsl != null ? yToPx(band.lsl) : HEIGHT - PAD.bottom;
        return (
          <g key={`band-${index}`} data-testid="time-series-band">
            <rect
              x={xToPx(band.from)}
              y={top}
              width={Math.max(1, xToPx(band.to) - xToPx(band.from))}
              height={Math.max(1, bottom - top)}
              fill={colors.brand100}
              fillOpacity="0.5"
            />
            {band.usl != null ? (
              <line
                x1={xToPx(band.from)}
                x2={xToPx(band.to)}
                y1={top}
                y2={top}
                stroke={colors.limit}
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
            ) : null}
            {band.lsl != null ? (
              <line
                x1={xToPx(band.from)}
                x2={xToPx(band.to)}
                y1={bottom}
                y2={bottom}
                stroke={colors.limit}
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
            ) : null}
          </g>
        );
      })}

      {/* Excursions shade the whole plot height so a short run is still
          visible on a cycle that runs for hours. */}
      {excursions.map((run, index) => {
        // Match on the worksheet row, not the printed label: a clock repeats
        // every day, so a label lookup would shade the wrong stretch of a
        // multi-day cycle. Decimation may drop the exact endpoints, so fall
        // back to the nearest plotted rows inside the run.
        const start =
          points.find((point) => point.row === run.startRow) ??
          points.find((point) => point.row >= run.startRow);
        const end =
          points.findLast((point) => point.row === run.endRow) ??
          points.findLast((point) => point.row <= run.endRow);
        if (!start || !end) return null;
        const x = xToPx(start.t);
        const width = Math.max(2, xToPx(end.t) - x);
        return (
          <rect
            key={`excursion-${index}`}
            data-testid="time-series-excursion"
            x={x}
            y={PAD.top}
            width={width}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill={colors.limit}
            fillOpacity="0.16"
          />
        );
      })}

      <polyline
        points={line}
        fill="none"
        stroke={colors.brand600}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <line
        x1={PAD.left}
        x2={WIDTH - PAD.right}
        y1={HEIGHT - PAD.bottom}
        y2={HEIGHT - PAD.bottom}
        stroke={colors.axis}
        strokeWidth="1"
      />
      <line
        x1={PAD.left}
        x2={PAD.left}
        y1={PAD.top}
        y2={HEIGHT - PAD.bottom}
        stroke={colors.axis}
        strokeWidth="1"
      />
      {xTicks.map((tick, index) => (
        <text
          key={`x-${tick}`}
          x={xToPx(tick)}
          y={HEIGHT - PAD.bottom + 16}
          textAnchor={xTickAnchor(index, xTicks.length)}
          fontSize="11"
          fill={colors.axis}
        >
          {formatTimeAxisTick(tick, span)}
        </text>
      ))}
      <text
        x={(PAD.left + WIDTH - PAD.right) / 2}
        y={HEIGHT - 12}
        textAnchor="middle"
        fontSize="12"
        fill={colors.axis}
      >
        {xLabel}
      </text>
      <text
        x={16}
        y={(PAD.top + HEIGHT - PAD.bottom) / 2}
        textAnchor="middle"
        fontSize="12"
        fill={colors.axis}
        transform={`rotate(-90 16 ${(PAD.top + HEIGHT - PAD.bottom) / 2})`}
      >
        {yLabel}
      </text>
    </svg>
  );
}

function ExcursionTable({
  excursions,
  conditionLabel,
  excursionReadings,
  judgedReadings,
}: {
  excursions: readonly TimeSeriesExcursion[];
  conditionLabel: string | null;
  excursionReadings: number;
  judgedReadings: number;
}) {
  // No band in force is not a pass. Saying "no reading left the acceptance
  // band" when there was no band to leave is a fabricated compliance claim,
  // and it is the kind that reads as reassuring.
  if (judgedReadings === 0) {
    return (
      <p
        data-testid="time-series-not-assessed"
        className="text-sm font-medium text-[var(--destructive)]"
      >
        No acceptance limits were in force, so excursions were not assessed.
        Set LSL/USL — or a condition column and its bands — and recompute.
      </p>
    );
  }
  if (excursions.length === 0) {
    return (
      <p
        data-testid="time-series-no-excursions"
        className="text-sm text-[var(--muted-foreground)]"
      >
        No reading left the acceptance band ({judgedReadings} reading
        {judgedReadings === 1 ? "" : "s"} assessed).
      </p>
    );
  }
  const worst = worstExcursion(excursions);
  const brief = excursions.filter((run) => run.readings === 1).length;
  return (
    <div className="overflow-x-auto">
      <p className="pb-2 text-xs text-[var(--muted-foreground)]">
        {excursions.length} excursion{excursions.length === 1 ? "" : "s"} ·{" "}
        {excursionReadings} out-of-band reading
        {excursionReadings === 1 ? "" : "s"}
        {brief > 0 ? ` · ${brief} of one reading` : ""}
      </p>
      {/* The table below is chronological, which is right for reading a cycle
          and wrong for finding its worst moment — that run is often last. */}
      {worst && excursions.length > 1 ? (
        <p
          className="pb-2 text-xs font-medium text-[var(--foreground)]"
          data-testid="time-series-worst-excursion"
        >
          Longest: {worst.startLabel} → {worst.endLabel} · {worst.readings}{" "}
          readings
          {worst.elapsedMinutes == null ? "" : ` / ${worst.elapsedMinutes} min`}{" "}
          · {worst.direction} to{" "}
          {formatStat(worst.direction === "high" ? worst.max : worst.min)}
          {worst.condition ? ` at ${worst.condition}` : ""}
        </p>
      ) : null}
      <table
        data-testid="time-series-excursions"
        className="w-full min-w-[46rem] border-collapse text-sm"
      >
        <thead>
          <tr className="border-b border-[var(--border)] text-left">
            <th className="py-1.5 pr-3 font-medium">Start</th>
            <th className="py-1.5 pr-3 font-medium">End</th>
            <th className="py-1.5 pr-3 text-right font-medium">Readings</th>
            <th className="py-1.5 pr-3 text-right font-medium">Elapsed</th>
            <th className="py-1.5 pr-3 font-medium">Direction</th>
            <th className="py-1.5 pr-3 text-right font-medium">Min</th>
            <th className="py-1.5 pr-3 text-right font-medium">Max</th>
            {conditionLabel ? (
              <th className="py-1.5 pr-3 font-medium">{conditionLabel}</th>
            ) : null}
            <th className="py-1.5 font-medium">Band</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {excursions.map((run, index) => (
            <tr
              key={`${run.startLabel}-${index}`}
              className="border-b border-[var(--border)]/60"
            >
              <td className="py-1.5 pr-3">{run.startLabel}</td>
              <td className="py-1.5 pr-3">{run.endLabel}</td>
              <td className="py-1.5 pr-3 text-right">{run.readings}</td>
              {/* Readings and elapsed minutes are different numbers; both are
                  shown so a report cannot quietly use one for the other. */}
              <td className="py-1.5 pr-3 text-right">
                {run.elapsedMinutes == null
                  ? "—"
                  : `${run.elapsedMinutes} min`}
              </td>
              <td className="py-1.5 pr-3">{run.direction}</td>
              <td className="py-1.5 pr-3 text-right">{formatStat(run.min)}</td>
              <td className="py-1.5 pr-3 text-right">{formatStat(run.max)}</td>
              {conditionLabel ? (
                <td className="py-1.5 pr-3">{run.condition ?? "—"}</td>
              ) : null}
              <td className="py-1.5">
                {run.lsl == null ? "—" : formatStat(run.lsl)} –{" "}
                {run.usl == null ? "—" : formatStat(run.usl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
