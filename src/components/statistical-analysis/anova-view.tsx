"use client";

import type { ReactNode } from "react";
import type { AnovaAnalysisSummary } from "@/lib/statistical-analysis/types";
import {
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
import { chartBrandColors, seriesFill } from "@/lib/charts/brand-colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnalysisRecomputeButton } from "@/components/statistical-analysis/analysis-recompute-button";

const WIDTH = 960;
const HEIGHT = 420;

function formatF(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return "∞";
  if (value === Number.NEGATIVE_INFINITY) return "−∞";
  return formatStat(value);
}

function IntervalPlot({ analysis }: { analysis: AnovaAnalysisSummary }) {
  const colors = chartBrandColors();
  const groups = analysis.results.groups;
  if (groups.length === 0) return null;

  const plotLeft = 72;
  const plotRight = WIDTH - 28;
  const plotTop = 56;
  const plotBottom = HEIGHT - 72;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const ys = groups.flatMap((group) => [group.ciLow, group.ciHigh, group.mean]);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.12;
  yMin -= pad;
  yMax += pad;
  const ySpan = yMax - yMin || 1;
  const xToPx = (index: number) =>
    plotLeft + ((index + 0.5) / groups.length) * plotWidth;
  const yToPx = (y: number) => plotBottom - ((y - yMin) / ySpan) * plotHeight;
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={`Interval plot of ${analysis.config.responseColumnName} by ${analysis.config.factorColumnName}`}
      data-testid="anova-interval-plot"
      className="max-h-[360px] rounded-md border border-[var(--border)] bg-white"
    >
      <rect width={WIDTH} height={HEIGHT} fill={colors.plotFill} />
      <text
        x={(plotLeft + plotRight) / 2}
        y={28}
        textAnchor="middle"
        fontSize="16"
        fill={colors.brand800}
      >
        Interval plot of {analysis.config.responseColumnName} vs{" "}
        {analysis.config.factorColumnName}
      </text>
      <text
        x={22}
        y={(plotTop + plotBottom) / 2}
        textAnchor="middle"
        fontSize="12"
        fill={colors.axis}
        transform={`rotate(-90 22 ${(plotTop + plotBottom) / 2})`}
      >
        {analysis.config.responseColumnName}
      </text>
      <text
        x={(plotLeft + plotRight) / 2}
        y={plotBottom + 52}
        textAnchor="middle"
        fontSize="12"
        fill={colors.axis}
      >
        {analysis.config.factorColumnName}
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
            y={yToPx(tick) + 4}
            textAnchor="end"
            fontSize="11"
            fill={colors.axis}
          >
            {formatStat(tick, 2)}
          </text>
        </g>
      ))}
      <rect
        x={plotLeft}
        y={plotTop}
        width={plotWidth}
        height={plotHeight}
        fill="none"
        stroke={colors.grid}
      />
      {groups.map((group, index) => {
        const x = xToPx(index);
        const fill = seriesFill(colors, index);
        return (
          <g key={group.label}>
            <line
              x1={x}
              x2={x}
              y1={yToPx(group.ciLow)}
              y2={yToPx(group.ciHigh)}
              stroke={fill}
              strokeWidth="2"
            />
            <line
              x1={x - 8}
              x2={x + 8}
              y1={yToPx(group.ciLow)}
              y2={yToPx(group.ciLow)}
              stroke={fill}
              strokeWidth="2"
            />
            <line
              x1={x - 8}
              x2={x + 8}
              y1={yToPx(group.ciHigh)}
              y2={yToPx(group.ciHigh)}
              stroke={fill}
              strokeWidth="2"
            />
            <circle cx={x} cy={yToPx(group.mean)} r="5" fill={fill} />
            <text
              x={x}
              y={plotBottom + 22}
              textAnchor="middle"
              fontSize="12"
              fill={colors.brand800}
            >
              {group.label.length > 12
                ? `${group.label.slice(0, 11)}…`
                : group.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Th({ children }: { children: string }) {
  return (
    <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
      {children}
    </th>
  );
}

function Td({
  children,
  testId,
  numeric = false,
}: {
  children: ReactNode;
  testId?: string;
  numeric?: boolean;
}) {
  return (
    <td
      data-testid={testId}
      className={`px-2 py-1 text-xs ${numeric ? "tabular-nums" : ""}`}
    >
      {children}
    </td>
  );
}

export function AnovaView({
  analysis,
  onEdit,
  onRecompute,
  onDelete,
  editing = false,
  recomputing = false,
  readOnly = false,
}: {
  analysis: AnovaAnalysisSummary;
  onEdit: () => void;
  onRecompute: () => void;
  onDelete: () => void;
  editing?: boolean;
  recomputing?: boolean;
  readOnly?: boolean;
}) {
  const { results, config, stale, title } = analysis;
  const rowLabel = formatRowSelection(normalizeRowSelection(config));
  const { factor, error, total } = results.table;

  return (
    <div
      data-testid="one-way-anova"
      className="flex h-full flex-col gap-3 overflow-auto p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            One-Way ANOVA: {config.responseColumnName} versus{" "}
            {config.factorColumnName}
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            {title}
            {rowLabel ? ` · ${rowLabel}` : ""} · Bonferroni pairwise using ANOVA
            MSE · α = {formatStat(results.alpha, 3)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stale ? (
            <Badge data-testid="anova-stale-badge" variant="warning">
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
              <AnalysisRecomputeButton
                onClick={onRecompute}
                recomputing={recomputing}
                disabled={editing}
              />
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
              <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <IntervalPlot analysis={analysis} />

      <section className="rounded-md border border-[var(--border)]">
        <h3 className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold">
          Analysis of variance
        </h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Source</Th>
              <Th>DF</Th>
              <Th>SS</Th>
              <Th>MS</Th>
              <Th>F</Th>
              <Th>P</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>{config.factorColumnName}</Td>
              <Td numeric>{String(factor.df)}</Td>
              <Td numeric>{formatStat(factor.ss)}</Td>
              <Td numeric>{formatStat(factor.ms)}</Td>
              <Td numeric testId="anova-f">
                {formatF(factor.f)}
              </Td>
              <Td numeric testId="anova-p">
                {formatPValue(factor.p)}
              </Td>
            </tr>
            <tr>
              <Td>Error</Td>
              <Td numeric>{String(error.df)}</Td>
              <Td numeric>{formatStat(error.ss)}</Td>
              <Td numeric>{formatStat(error.ms)}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
            </tr>
            <tr>
              <Td>Total</Td>
              <Td numeric>{String(total.df)}</Td>
              <Td numeric>{formatStat(total.ss)}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
            </tr>
          </tbody>
        </table>
        <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
          N = {results.n}
          {results.skipped > 0 ? ` · ${results.skipped} skipped` : ""} · R-sq ={" "}
          {formatStat(results.rSquared)} · Grand mean ={" "}
          {formatStat(results.grandMean)}
        </p>
      </section>

      <section className="rounded-md border border-[var(--border)]">
        <h3 className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold">
          Means and 95% CIs
        </h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>{config.factorColumnName}</Th>
              <Th>N</Th>
              <Th>Mean</Th>
              <Th>StDev</Th>
              <Th>SE</Th>
              <Th>95% CI</Th>
            </tr>
          </thead>
          <tbody>
            {results.groups.map((group) => (
              <tr key={group.label}>
                <Td>{group.label}</Td>
                <Td numeric>{String(group.n)}</Td>
                <Td numeric>{formatStat(group.mean)}</Td>
                <Td numeric>{formatStat(group.stdev)}</Td>
                <Td numeric>{formatStat(group.se)}</Td>
                <Td numeric>
                  {formatStat(group.ciLow)} – {formatStat(group.ciHigh)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-md border border-[var(--border)]">
        <h3 className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold">
          Pairwise comparisons (Bonferroni t-tests using ANOVA MSE)
        </h3>
        {results.pairwise.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
            No pairwise comparisons.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Comparison</Th>
                <Th>Diff</Th>
                <Th>SE</Th>
                <Th>t</Th>
                <Th>P unadj.</Th>
                <Th>P Bonf.</Th>
                <Th>Sig.</Th>
              </tr>
            </thead>
            <tbody>
              {results.pairwise.map((pair) => (
                <tr key={`${pair.groupA}-${pair.groupB}`}>
                  <Td>
                    {pair.groupA} − {pair.groupB}
                  </Td>
                  <Td numeric>{formatStat(pair.diff)}</Td>
                  <Td numeric>{formatStat(pair.se)}</Td>
                  <Td numeric>{formatF(pair.t)}</Td>
                  <Td numeric>{formatPValue(pair.pUnadjusted)}</Td>
                  <Td numeric>{formatPValue(pair.pBonferroni)}</Td>
                  <Td>{pair.significant ? "Yes" : "No"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
