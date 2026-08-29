"use client";

import { useEffect, useState } from "react";
import {
  analyticsPlotKindLabel,
  analyticsRevisionDiffIsEmpty,
  type AnalyticsAnalysisChange,
  type AnalyticsRevisionDiff,
} from "@/lib/analytics-revisions/diff";

function analysisChangeCopy(analysis: AnalyticsAnalysisChange): string {
  const plot = analyticsPlotKindLabel(analysis.plotKind);
  switch (analysis.kind) {
    case "added":
      return `Added ${analysis.title} (${plot})`;
    case "removed":
      return `Removed ${analysis.title} (${plot})`;
    case "changed":
      return `Updated ${analysis.title} (${plot})`;
    default: {
      const exhaustive: never = analysis.kind;
      return exhaustive;
    }
  }
}

export function AnalyticsRevisionDiffView({
  reportId,
  from,
  to,
  onExit,
}: {
  reportId: string;
  from: number;
  to: number;
  onExit: () => void;
}) {
  const [diff, setDiff] = useState<AnalyticsRevisionDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      setDiff(null);
      try {
        const res = await fetch(
          `/api/reports/${reportId}/analytics/revisions/diff?from=${from}&to=${to}`
        );
        const data = (await res.json()) as {
          error?: string;
          diff?: AnalyticsRevisionDiff;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not compare these versions.");
          return;
        }
        setDiff(data.diff ?? null);
      } catch {
        if (!cancelled) setError("Could not compare these versions.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, reportId, to]);

  return (
    <div
      data-testid="analytics-revision-diff"
      className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-4"
    >
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2">
        <p className="text-sm font-medium text-[var(--foreground)]">
          Comparing version {from} → version {to}
        </p>
        <button
          type="button"
          data-testid="analytics-revision-diff-exit"
          onClick={onExit}
          className="rounded-md px-2 py-1 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
        >
          Exit
        </button>
      </div>
      {error ? (
        <p className="text-sm text-[var(--muted-foreground)]">{error}</p>
      ) : diff == null ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Loading differences…
        </p>
      ) : analyticsRevisionDiffIsEmpty(diff) ? (
        <p className="text-sm text-[var(--muted-foreground)]">No differences.</p>
      ) : (
        <div className="space-y-6 text-sm">
          {diff.sheets.length > 0 ? (
            <section className="space-y-1">
              <h2 className="text-sm font-semibold">Sheets</h2>
              {diff.sheets.map((sheet, index) => {
                switch (sheet.kind) {
                  case "added":
                    return (
                      <p key={`sheet-${index}`} className="suggestion-insert">
                        Added {sheet.name}
                      </p>
                    );
                  case "removed":
                    return (
                      <p key={`sheet-${index}`} className="suggestion-delete">
                        Removed {sheet.name}
                      </p>
                    );
                  case "renamed":
                    return (
                      <p key={`sheet-${index}`}>
                        Renamed {sheet.from} → {sheet.to}
                      </p>
                    );
                  default: {
                    const exhaustive: never = sheet;
                    return exhaustive;
                  }
                }
              })}
            </section>
          ) : null}
          {diff.columns.length > 0 ? (
            <section className="space-y-1">
              <h2 className="text-sm font-semibold">Columns</h2>
              {diff.columns.map((column, index) => {
                switch (column.kind) {
                  case "added":
                    return (
                      <p key={`col-${index}`}>
                        Added {column.name} on {column.sheet}
                      </p>
                    );
                  case "removed":
                    return (
                      <p key={`col-${index}`}>
                        Removed {column.name} on {column.sheet}
                      </p>
                    );
                  case "renamed":
                    return (
                      <p key={`col-${index}`}>
                        Renamed {column.from} → {column.to} on {column.sheet}
                      </p>
                    );
                  default: {
                    const exhaustive: never = column;
                    return exhaustive;
                  }
                }
              })}
            </section>
          ) : null}
          {diff.cells.length > 0 ? (
            <section className="space-y-1">
              <h2 className="text-sm font-semibold">Cells</h2>
              {diff.cells.map((cell) => (
                <p key={`${cell.sheet}-${cell.column}-${cell.row}`}>
                  {cell.sheet} · {cell.column} · row {cell.row}:{" "}
                  <span className="suggestion-delete">{cell.from || "∅"}</span>
                  {" → "}
                  <span className="suggestion-insert">{cell.to || "∅"}</span>
                </p>
              ))}
              {diff.truncatedCells ? (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Showing the first 200 cell changes.
                </p>
              ) : null}
            </section>
          ) : null}
          {diff.specs.length > 0 ? (
            <section className="space-y-1">
              <h2 className="text-sm font-semibold">Specs</h2>
              {diff.specs.map((spec) => (
                <p key={`${spec.columnName}-${spec.field}`}>
                  {spec.columnName} {spec.field.toUpperCase()}:{" "}
                  <span className="suggestion-delete">{spec.from || "∅"}</span>
                  {" → "}
                  <span className="suggestion-insert">{spec.to || "∅"}</span>
                </p>
              ))}
            </section>
          ) : null}
          {diff.analyses.length > 0 ? (
            <section className="space-y-1">
              <h2 className="text-sm font-semibold">Results</h2>
              {diff.analyses.map((analysis) => {
                switch (analysis.kind) {
                  case "added":
                    return (
                      <p key={analysis.id} className="suggestion-insert">
                        {analysisChangeCopy(analysis)}
                      </p>
                    );
                  case "removed":
                    return (
                      <p key={analysis.id} className="suggestion-delete">
                        {analysisChangeCopy(analysis)}
                      </p>
                    );
                  case "changed":
                    return (
                      <p key={analysis.id}>{analysisChangeCopy(analysis)}</p>
                    );
                  default: {
                    const exhaustive: never = analysis.kind;
                    return exhaustive;
                  }
                }
              })}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

export { AnalyticsRevisionDiffView as AnalyticsRevisionDiff };
