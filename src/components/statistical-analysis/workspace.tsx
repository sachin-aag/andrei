"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutoSave, type SaveStatus } from "@/hooks/use-auto-save";
import {
  collapseSelection,
  rowRangeFromGridSelection,
  type GridSelection,
} from "@/lib/statistical-analysis/grid-selection";
import {
  createCapabilitySixpack,
  createMeasurementScatter,
  createOneWayAnova,
  deleteCapabilitySixpack,
  getReportAnalytics,
  patchReportAnalytics,
  recomputeCapabilitySixpack,
} from "@/lib/statistical-analysis/client";
import { applySampleAssay } from "@/lib/statistical-analysis/sample-data";
import {
  addDataSheet,
  createEmptyWorksheet,
  deleteColumn,
  deleteDataSheet,
  deleteRow,
  dropSpecRow,
  insertColumn,
  insertRow,
  specRowForColumn,
  switchWorksheetTab,
  upsertSpecRow,
} from "@/lib/statistical-analysis/worksheet";
import {
  isAnovaAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  type ReportAnalyticsView,
  type StatisticalAnalysisSummary,
  type WorksheetData,
} from "@/lib/statistical-analysis/types";
import { analysisListSubtitle, withLocalStale } from "@/lib/statistical-analysis/stale";
import { CapabilityDialog } from "@/components/statistical-analysis/capability-dialog";
import { AnovaDialog } from "@/components/statistical-analysis/anova-dialog";
import { PlotMeasurementsDialog } from "@/components/statistical-analysis/plot-measurements-dialog";
import { ScatterView } from "@/components/statistical-analysis/scatter-view";
import { AnovaView } from "@/components/statistical-analysis/anova-view";
import { SixpackView } from "@/components/statistical-analysis/sixpack-view";
import { ColumnSpecsDialog } from "@/components/statistical-analysis/column-specs-dialog";
import {
  WorksheetGrid,
} from "@/components/statistical-analysis/worksheet-grid";
import { WorkspaceMenubar } from "@/components/statistical-analysis/workspace-menubar";

function saveLabel(status: SaveStatus): string {
  switch (status) {
    case "idle":
      return "";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Save failed";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function StatisticalWorkspace({
  reportId,
  readOnly,
  reloadEpoch,
}: {
  reportId: string;
  readOnly: boolean;
  reloadEpoch: number;
}) {
  const [worksheet, setWorksheet] = useState(createEmptyWorksheet);
  const [persistedWorksheet, setPersistedWorksheet] = useState(createEmptyWorksheet);
  const [analyses, setAnalyses] = useState<StatisticalAnalysisSummary[]>([]);
  const [selection, setSelection] = useState<GridSelection>(() =>
    collapseSelection(0, 0)
  );
  const [tab, setTab] = useState("worksheet");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [capabilityColumnId, setCapabilityColumnId] = useState("");
  const [capabilityRowStart, setCapabilityRowStart] = useState<number | null>(
    null
  );
  const [capabilityRowEnd, setCapabilityRowEnd] = useState<number | null>(null);
  const [capabilitySubmitting, setCapabilitySubmitting] = useState(false);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [plotOpen, setPlotOpen] = useState(false);
  const [plotSubmitting, setPlotSubmitting] = useState(false);
  const [plotError, setPlotError] = useState<string | null>(null);
  const [anovaOpen, setAnovaOpen] = useState(false);
  const [anovaResponseColumnId, setAnovaResponseColumnId] = useState("");
  const [anovaRowStart, setAnovaRowStart] = useState<number | null>(null);
  const [anovaRowEnd, setAnovaRowEnd] = useState<number | null>(null);
  const [anovaSubmitting, setAnovaSubmitting] = useState(false);
  const [anovaError, setAnovaError] = useState<string | null>(null);
  const [specsColumnId, setSpecsColumnId] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const analysisCountRef = useRef(0);

  const applyAnalytics = useCallback((
    next: ReportAnalyticsView,
    opts?: { selectAnalysisId?: string }
  ) => {
    setWorksheet(next.worksheet);
    setPersistedWorksheet(next.worksheet);
    setAnalyses(next.analyses);
    analysisCountRef.current = next.analyses.length;
    setSelectedAnalysisId((current) => {
      if (
        opts?.selectAnalysisId &&
        next.analyses.some((item) => item.id === opts.selectAnalysisId)
      ) {
        return opts.selectAnalysisId;
      }
      if (current && next.analyses.some((item) => item.id === current)) {
        return current;
      }
      return next.analyses[0]?.id ?? null;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await getReportAnalytics(reportId);
      applyAnalytics(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load analytics."
      );
    } finally {
      setLoading(false);
    }
  }, [applyAnalytics, reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (reloadEpoch === 0) return;
    void load();
  }, [load, reloadEpoch]);

  useEffect(() => {
    if (analyses.length > analysisCountRef.current) {
      setTab("results");
    }
    analysisCountRef.current = analyses.length;
  }, [analyses.length]);

  const onSave = useCallback(
    async (
      value: WorksheetData,
      context?: { signal?: AbortSignal }
    ) => {
      try {
        const next = await patchReportAnalytics(
          reportId,
          { worksheet: value },
          context?.signal
        );
        setPersistedWorksheet(next.worksheet);
        setAnalyses(next.analyses);
      } catch (error) {
        if (context?.signal?.aborted) throw error;
        toast.error(
          error instanceof Error ? error.message : "Could not save the worksheet."
        );
        throw error;
      }
    },
    [reportId]
  );

  const { status, flush } = useAutoSave({
    value: worksheet,
    onSave,
    enabled: !readOnly && !loading,
    beaconUrl: `/api/reports/${encodeURIComponent(reportId)}/analytics`,
  });

  const displayedAnalyses = withLocalStale(
    analyses,
    worksheet,
    persistedWorksheet
  );
  const selectedAnalysis =
    displayedAnalyses.find((item) => item.id === selectedAnalysisId) ??
    displayedAnalyses[0] ??
    null;

  const selectedColumn =
    worksheet.columns[selection.col] ?? worksheet.columns[0] ?? null;
  const selectedColumnId = selectedColumn?.id ?? "";
  const selectedColumnName = selectedColumn?.name ?? "column";
  const selectedRowRange = rowRangeFromGridSelection(selection);
  const analyzeLabel = selectedRowRange
    ? `Analyze ${selectedColumnName} rows ${selectedRowRange.start}–${selectedRowRange.end}`
    : `Analyze ${selectedColumnName}`;
  const specsColumn =
    worksheet.columns.find((column) => column.id === specsColumnId) ?? null;

  const openSixpackForColumn = async (
    columnId: string,
    rows: { start: number; end: number } | null = null
  ) => {
    if (readOnly) return;
    await flush().catch(() => undefined);
    setCapabilityColumnId(columnId);
    setCapabilityRowStart(rows?.start ?? null);
    setCapabilityRowEnd(rows?.end ?? null);
    setCapabilityError(null);
    setCapabilityOpen(true);
  };

  const openPlotMeasurements = async () => {
    if (readOnly) return;
    await flush().catch(() => undefined);
    setPlotError(null);
    setPlotOpen(true);
  };

  const openOneWayAnova = async (
    columnId: string,
    rows: { start: number; end: number } | null = null
  ) => {
    if (readOnly) return;
    await flush().catch(() => undefined);
    setAnovaResponseColumnId(columnId);
    setAnovaRowStart(rows?.start ?? null);
    setAnovaRowEnd(rows?.end ?? null);
    setAnovaError(null);
    setAnovaOpen(true);
  };

  if (loading) {
    return (
      <div
        data-testid="report-analytics-workspace"
        className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]"
      >
        Loading worksheet…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        data-testid="report-analytics-workspace"
        className="flex h-full items-center justify-center p-6 text-sm text-[var(--muted-foreground)]"
      >
        {loadError}
      </div>
    );
  }

  return (
    <div
      data-testid="report-analytics-workspace"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <header className="shrink-0 border-b border-[var(--border)] px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-sm font-semibold">Statistical Analysis</h2>
            <span className="text-xs text-[var(--muted-foreground)]">
              {readOnly ? "View only" : saveLabel(status)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <WorkspaceMenubar
              readOnly={readOnly}
              onInsertColumn={() => {
                setWorksheet((current) => insertColumn(current, selection.col));
              }}
              onDeleteColumn={() => {
                setWorksheet((current) => {
                  const next = deleteColumn(current, selection.col);
                  setSelection((sel) => {
                    const maxCol = next.columns.length - 1;
                    return {
                      ...sel,
                      col: Math.min(sel.col, maxCol),
                      anchorCol: Math.min(sel.anchorCol, maxCol),
                    };
                  });
                  return next;
                });
              }}
              onInsertRow={() => {
                setWorksheet((current) => insertRow(current, selection.row));
              }}
              onDeleteRow={() => {
                setWorksheet((current) => deleteRow(current, selection.row));
              }}
              onLoadSample={() => {
                setWorksheet((current) => applySampleAssay(current, selection.col));
                toast.success(
                  "Loaded sample assay measurements and Lot labels into the selected columns."
                );
              }}
              onNormalSixpack={() =>
                void openSixpackForColumn(selectedColumnId, selectedRowRange)
              }
              onOneWayAnova={() =>
                void openOneWayAnova(selectedColumnId, selectedRowRange)
              }
              onPlotMeasurements={() => void openPlotMeasurements()}
              onAddDataSheet={() => {
                setWorksheet((current) => addDataSheet(current));
                setSelection(collapseSelection(0, 0));
              }}
            />
            {readOnly ? null : (
              <Button
                type="button"
                size="sm"
                data-testid="analyze-selected-column"
                disabled={!selectedColumnId}
                onClick={() =>
                  void openSixpackForColumn(selectedColumnId, selectedRowRange)
                }
              >
                {analyzeLabel}
              </Button>
            )}
          </div>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-[var(--border)] px-4">
          <TabsList className="w-auto justify-start bg-transparent p-0">
            <TabsTrigger
              value="worksheet"
              data-testid="workspace-tab-worksheet"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--brand-600)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-none"
            >
              Worksheet
            </TabsTrigger>
            <TabsTrigger
              value="results"
              data-testid="workspace-tab-results"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--brand-600)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-none"
            >
              Results
              {displayedAnalyses.length > 0
                ? ` (${displayedAnalyses.length})`
                : ""}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="worksheet"
          className="mt-0 min-h-0 flex-1 overflow-hidden"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div
              data-testid="worksheet-sheet-tabs"
              className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--border)] px-4 py-1.5"
            >
              {worksheet.sheets.map((sheet) => {
                const active = worksheet.activeSheetId === sheet.id;
                return (
                  <button
                    key={sheet.id}
                    type="button"
                    aria-label={`${sheet.name} sheet`}
                    data-testid={`worksheet-sheet-tab-${sheet.id}`}
                    onClick={() =>
                      setWorksheet((current) =>
                        switchWorksheetTab(current, sheet.id)
                      )
                    }
                    className={`rounded-md px-2 py-1 text-xs ${
                      active
                        ? "bg-[var(--secondary)] font-medium text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/60"
                    }`}
                  >
                    {sheet.name}
                  </button>
                );
              })}
              {readOnly || worksheet.sheets.length <= 1 ? null : (
                <button
                  type="button"
                  data-testid="delete-data-sheet"
                  onClick={() => {
                    setWorksheet((current) =>
                      deleteDataSheet(current, current.activeSheetId)
                    );
                    setSelection(collapseSelection(0, 0));
                  }}
                  className="ml-auto rounded-md px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/60"
                >
                  Delete sheet
                </button>
              )}
            </div>
            <WorksheetGrid
              worksheet={worksheet}
              selection={selection}
              onSelectionChange={setSelection}
              onChange={setWorksheet}
              readOnly={readOnly}
              onAnalyzeColumn={(colIndex) => {
                const column = worksheet.columns[colIndex];
                if (!column) return;
                setSelection(collapseSelection(colIndex, selection.row));
                void openSixpackForColumn(column.id, null);
              }}
              onEditColumnSpecs={(colIndex) => {
                const column = worksheet.columns[colIndex];
                if (!column) return;
                setSelection(collapseSelection(colIndex, selection.row));
                // Open after the column context menu unmounts so Radix does
                // not leave body pointer-events: none when the dialog closes.
                window.setTimeout(() => setSpecsColumnId(column.id), 0);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent
          value="results"
          className="mt-0 hidden min-h-0 flex-1 overflow-hidden data-[state=active]:flex"
        >
          {displayedAnalyses.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="max-w-md text-sm text-[var(--muted-foreground)]">
                Select a worksheet column — or Shift+arrow a row range — and
                click <strong>Analyze {selectedColumnName}</strong>, use{" "}
                <strong>Stat → One-Way ANOVA</strong>, or{" "}
                <strong>Stat → Plot measurements</strong> for an attachment
                scatter. Each run is saved as its own result.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1">
              <aside
                data-testid="analysis-list"
                className="w-56 shrink-0 overflow-y-auto border-r border-[var(--border)] p-2"
              >
                <div className="flex items-center justify-between gap-2 px-2 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Analyses
                  </p>
                  {readOnly ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[11px]"
                      data-testid="new-analysis"
                      onClick={() =>
                        void openSixpackForColumn(
                          selectedColumnId,
                          selectedRowRange
                        )
                      }
                    >
                      New
                    </Button>
                  )}
                </div>
                <ul className="space-y-1">
                  {displayedAnalyses.map((analysis) => {
                    const active = selectedAnalysis?.id === analysis.id;
                    const subtitle = analysisListSubtitle(analysis);
                    return (
                      <li key={analysis.id}>
                        <button
                          type="button"
                          data-testid={`analysis-item-${analysis.id}`}
                          data-analysis-title={analysis.title}
                          onClick={() => setSelectedAnalysisId(analysis.id)}
                          className={`w-full rounded-md px-2 py-2 text-left text-xs transition-colors ${
                            active
                              ? "bg-[var(--brand-700)] text-white"
                              : "hover:bg-[var(--secondary)]"
                          }`}
                        >
                          <span className="block font-medium">{analysis.title}</span>
                          <span
                            className={`block ${
                              active
                                ? "text-white/80"
                                : "text-[var(--muted-foreground)]"
                            }`}
                          >
                            {subtitle}
                          </span>
                          <span
                            className={`block ${
                              active
                                ? "text-white/80"
                                : "text-[var(--muted-foreground)]"
                            }`}
                          >
                            {analysis.stale ? "Needs recompute · " : ""}
                            {new Date(analysis.createdAt).toLocaleString()}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>
              <div className="min-w-0 flex-1 overflow-hidden">
                {selectedAnalysis && isScatterAnalysis(selectedAnalysis) ? (
                  <ScatterView
                    analysis={selectedAnalysis}
                    readOnly={readOnly}
                    recomputing={recomputing}
                    onRecompute={async () => {
                      setRecomputing(true);
                      try {
                        await flush().catch(() => undefined);
                        const next = await recomputeCapabilitySixpack(
                          reportId,
                          selectedAnalysis.id
                        );
                        applyAnalytics(next);
                        toast.success("Scatter recomputed from the attachments.");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not recompute the analysis."
                        );
                      } finally {
                        setRecomputing(false);
                      }
                    }}
                    onDelete={async () => {
                      try {
                        const next = await deleteCapabilitySixpack(
                          reportId,
                          selectedAnalysis.id
                        );
                        applyAnalytics(next);
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not delete the analysis."
                        );
                      }
                    }}
                  />
                ) : selectedAnalysis && isAnovaAnalysis(selectedAnalysis) ? (
                  <AnovaView
                    analysis={selectedAnalysis}
                    readOnly={readOnly}
                    recomputing={recomputing}
                    onRecompute={async () => {
                      setRecomputing(true);
                      try {
                        await flush().catch(() => undefined);
                        const next = await recomputeCapabilitySixpack(
                          reportId,
                          selectedAnalysis.id
                        );
                        applyAnalytics(next);
                        toast.success("ANOVA recomputed from the current columns.");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not recompute the analysis."
                        );
                      } finally {
                        setRecomputing(false);
                      }
                    }}
                    onDelete={async () => {
                      try {
                        const next = await deleteCapabilitySixpack(
                          reportId,
                          selectedAnalysis.id
                        );
                        applyAnalytics(next);
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not delete the analysis."
                        );
                      }
                    }}
                  />
                ) : selectedAnalysis && isSixpackAnalysis(selectedAnalysis) ? (
                  <SixpackView
                    analysis={selectedAnalysis}
                    readOnly={readOnly}
                    recomputing={recomputing}
                    onRecompute={async () => {
                      setRecomputing(true);
                      try {
                        await flush().catch(() => undefined);
                        const next = await recomputeCapabilitySixpack(
                          reportId,
                          selectedAnalysis.id
                        );
                        applyAnalytics(next);
                        toast.success("Sixpack recomputed from the current column.");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not recompute the analysis."
                        );
                      } finally {
                        setRecomputing(false);
                      }
                    }}
                    onDelete={async () => {
                      try {
                        const next = await deleteCapabilitySixpack(
                          reportId,
                          selectedAnalysis.id
                        );
                        applyAnalytics(next);
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not delete the analysis."
                        );
                      }
                    }}
                  />
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CapabilityDialog
        key={capabilityOpen ? "open" : "closed"}
        open={capabilityOpen}
        worksheet={worksheet}
        defaultColumnId={capabilityColumnId || selectedColumnId}
        defaultRowStart={capabilityRowStart}
        defaultRowEnd={capabilityRowEnd}
        submitting={capabilitySubmitting}
        error={capabilityError}
        onOpenChange={setCapabilityOpen}
        onSubmit={async (values) => {
          setCapabilitySubmitting(true);
          setCapabilityError(null);
          try {
            await flush().catch(() => undefined);
            const created = await createCapabilitySixpack(reportId, {
              columnId: values.columnId,
              title: values.title || undefined,
              lsl: values.lsl,
              usl: values.usl,
              target: values.target,
              rowStart: values.rowStart,
              rowEnd: values.rowEnd,
            });
            applyAnalytics(created.analytics, {
              selectAnalysisId: created.analysisId,
            });
            setCapabilityOpen(false);
            setTab("results");
          } catch (error) {
            setCapabilityError(
              error instanceof Error
                ? error.message
                : "Could not run the sixpack."
            );
          } finally {
            setCapabilitySubmitting(false);
          }
        }}
      />

      <ColumnSpecsDialog
        key={specsColumn ? `${specsColumn.id}-open` : "specs-closed"}
        open={Boolean(specsColumn)}
        columnName={specsColumn?.name ?? ""}
        spec={
          specsColumn
            ? specRowForColumn(worksheet, specsColumn.name)
            : undefined
        }
        readOnly={readOnly}
        onOpenChange={(open) => {
          if (!open) setSpecsColumnId(null);
        }}
        onSave={(values) => {
          if (!specsColumn) return;
          const empty =
            !values.lsl.trim() && !values.usl.trim() && !values.target.trim();
          setWorksheet((current) =>
            empty
              ? dropSpecRow(current, specsColumn.name)
              : upsertSpecRow(current, {
                  columnName: specsColumn.name,
                  lsl: values.lsl,
                  usl: values.usl,
                  target: values.target,
                })
          );
          setSpecsColumnId(null);
        }}
      />

      <AnovaDialog
        key={anovaOpen ? "anova-open" : "anova-closed"}
        open={anovaOpen}
        worksheet={worksheet}
        defaultResponseColumnId={anovaResponseColumnId || selectedColumnId}
        defaultRowStart={anovaRowStart}
        defaultRowEnd={anovaRowEnd}
        submitting={anovaSubmitting}
        error={anovaError}
        onOpenChange={setAnovaOpen}
        onSubmit={async (values) => {
          setAnovaSubmitting(true);
          setAnovaError(null);
          try {
            await flush().catch(() => undefined);
            const created = await createOneWayAnova(reportId, {
              responseColumnId: values.responseColumnId,
              factorColumnId: values.factorColumnId,
              title: values.title || undefined,
              rowStart: values.rowStart,
              rowEnd: values.rowEnd,
            });
            applyAnalytics(created.analytics, {
              selectAnalysisId: created.analysisId,
            });
            setAnovaOpen(false);
            setTab("results");
          } catch (error) {
            setAnovaError(
              error instanceof Error
                ? error.message
                : "Could not run the ANOVA."
            );
          } finally {
            setAnovaSubmitting(false);
          }
        }}
      />

      <PlotMeasurementsDialog
        key={plotOpen ? "plot-open" : "plot-closed"}
        open={plotOpen}
        submitting={plotSubmitting}
        error={plotError}
        onOpenChange={setPlotOpen}
        onSubmit={async (values) => {
          setPlotSubmitting(true);
          setPlotError(null);
          try {
            await flush().catch(() => undefined);
            const created = await createMeasurementScatter(reportId, {
              query: values.query,
              title: values.title || undefined,
              xLabel: values.xLabel || undefined,
              yLabel: values.yLabel || undefined,
              layout: { mode: values.mode },
              lsl: values.lsl,
              usl: values.usl,
            });
            applyAnalytics(created.analytics, {
              selectAnalysisId: created.analysisId,
            });
            setPlotOpen(false);
            setTab("results");
          } catch (error) {
            setPlotError(
              error instanceof Error
                ? error.message
                : "Could not plot measurements."
            );
          } finally {
            setPlotSubmitting(false);
          }
        }}
      />
    </div>
  );
}
