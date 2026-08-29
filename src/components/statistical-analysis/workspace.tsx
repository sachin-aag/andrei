"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  createXyScatter,
  deleteCapabilitySixpack,
  getReportAnalytics,
  patchReportAnalytics,
  recomputeAnalysis,
  updateAnalysis,
  AnalyticsConflictError,
} from "@/lib/statistical-analysis/client";
import { applySampleAssay } from "@/lib/statistical-analysis/sample-data";
import {
  addDataSheet,
  clearColumn,
  createEmptyWorksheet,
  deleteColumn,
  deleteDataSheet,
  dropSpecRow,
  insertColumn,
  mergeDirtyWorksheet,
  normalizeWorksheet,
  renameDataSheet,
  specRowForColumn,
  switchWorksheetTab,
  upsertSpecRow,
  worksheetsEqual,
} from "@/lib/statistical-analysis/worksheet";
import {
  MEASUREMENT_SCATTER,
  ONE_WAY_ANOVA,
  isAnovaAnalysis,
  isScatterAnalysis,
  isSixpackAnalysis,
  isXyScatterAnalysis,
  type ReportAnalyticsView,
  type StatisticalAnalysisSummary,
  type WorksheetData,
} from "@/lib/statistical-analysis/types";
import { analysisListSubtitle, withLocalStale } from "@/lib/statistical-analysis/stale";
import { AnalyzeDialog } from "@/components/statistical-analysis/analyze-dialog";
import { CapabilityDialog } from "@/components/statistical-analysis/capability-dialog";
import { AnovaDialog } from "@/components/statistical-analysis/anova-dialog";
import { PlotMeasurementsDialog } from "@/components/statistical-analysis/plot-measurements-dialog";
import { XyScatterDialog } from "@/components/statistical-analysis/xy-scatter-dialog";
import { ScatterView } from "@/components/statistical-analysis/scatter-view";
import { AnovaView } from "@/components/statistical-analysis/anova-view";
import { SixpackView } from "@/components/statistical-analysis/sixpack-view";
import { ColumnSpecsDialog } from "@/components/statistical-analysis/column-specs-dialog";
import {
  WorksheetGrid,
  type ColumnMenuAction,
} from "@/components/statistical-analysis/worksheet-grid";
import { WorkspaceMenubar } from "@/components/statistical-analysis/workspace-menubar";

export type AnalyticsFocusApi = {
  focusSheet: (sheetId: string) => void;
  focusAnalysis: (analysisId: string) => void;
};

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
  agentBusy = false,
  focusApiRef,
}: {
  reportId: string;
  readOnly: boolean;
  reloadEpoch: number;
  agentBusy?: boolean;
  focusApiRef?: React.MutableRefObject<AnalyticsFocusApi | null>;
}) {
  const [worksheet, setWorksheet] = useState(createEmptyWorksheet);
  const [persistedWorksheet, setPersistedWorksheet] = useState(createEmptyWorksheet);
  const [analyses, setAnalyses] = useState<StatisticalAnalysisSummary[]>([]);
  const [selection, setSelection] = useState<GridSelection>(() =>
    collapseSelection(0, 0)
  );
  const [tab, setTab] = useState("worksheet");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusApiRef) return;
    focusApiRef.current = {
      focusSheet: (sheetId) => {
        setWorksheet((current) => switchWorksheetTab(current, sheetId));
        setTab("worksheet");
      },
      focusAnalysis: (analysisId) => {
        setSelectedAnalysisId(analysisId);
        setTab("results");
      },
    };
    return () => {
      focusApiRef.current = null;
    };
  }, [focusApiRef]);

  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeColumnId, setAnalyzeColumnId] = useState("");
  const [analyzeRowStart, setAnalyzeRowStart] = useState<number | null>(null);
  const [analyzeRowEnd, setAnalyzeRowEnd] = useState<number | null>(null);
  const [analyzeSubmitting, setAnalyzeSubmitting] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
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
  const [xyOpen, setXyOpen] = useState(false);
  const [xyYColumnId, setXyYColumnId] = useState("");
  const [xyRowStart, setXyRowStart] = useState<number | null>(null);
  const [xyRowEnd, setXyRowEnd] = useState<number | null>(null);
  const [xySubmitting, setXySubmitting] = useState(false);
  const [xyError, setXyError] = useState<string | null>(null);
  const [specsColumnId, setSpecsColumnId] = useState<string | null>(null);
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [sheetNameDraft, setSheetNameDraft] = useState("");
  const [editingAnalysisId, setEditingAnalysisId] = useState<string | null>(null);
  const [recomputingAnalysisId, setRecomputingAnalysisId] = useState<string | null>(
    null
  );
  const sheetNameInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const analysisCountRef = useRef(0);
  const worksheetRef = useRef(worksheet);
  const persistedRef = useRef(persistedWorksheet);
  const versionRef = useRef(version);
  const markPersistedRef = useRef<(next: WorksheetData) => void>(() => {});

  useLayoutEffect(() => {
    worksheetRef.current = worksheet;
  }, [worksheet]);
  useLayoutEffect(() => {
    persistedRef.current = persistedWorksheet;
  }, [persistedWorksheet]);
  useLayoutEffect(() => {
    versionRef.current = version;
  }, [version]);

  const applyAnalytics = useCallback((
    next: ReportAnalyticsView,
    opts?: { selectAnalysisId?: string }
  ) => {
    setWorksheet(next.worksheet);
    setPersistedWorksheet(next.worksheet);
    versionRef.current = next.version;
    setVersion(next.version);
    setAnalyses(next.analyses);
    analysisCountRef.current = next.analyses.length;
    markPersistedRef.current(next.worksheet);
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

  const ingestRemote = useCallback(
    (next: ReportAnalyticsView) => {
      const merged = mergeDirtyWorksheet(
        worksheetRef.current,
        persistedRef.current,
        next.worksheet
      );
      if (worksheetsEqual(merged, next.worksheet)) {
        applyAnalytics(next);
        return;
      }
      setWorksheet(merged);
      setPersistedWorksheet(next.worksheet);
      versionRef.current = next.version;
      setVersion(next.version);
      setAnalyses(next.analyses);
      analysisCountRef.current = next.analyses.length;
      setSelectedAnalysisId((current) => {
        if (current && next.analyses.some((item) => item.id === current)) {
          return current;
        }
        return next.analyses[0]?.id ?? null;
      });
    },
    [applyAnalytics]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await getReportAnalytics(reportId);
        if (cancelled) return;
        applyAnalytics(next);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Could not load analytics."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyAnalytics, reportId]);

  useEffect(() => {
    if (reloadEpoch === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await getReportAnalytics(reportId);
        if (cancelled) return;
        ingestRemote(next);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Could not load analytics."
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ingestRemote, reloadEpoch, reportId]);

  useEffect(() => {
    if (analyses.length > analysisCountRef.current) {
      setTab("results");
    }
    analysisCountRef.current = analyses.length;
  }, [analyses.length]);

  const applySavedWorksheet = useCallback(
    (saved: ReportAnalyticsView, sent: WorksheetData): WorksheetData => {
      versionRef.current = saved.version;
      setVersion(saved.version);
      setAnalyses(saved.analyses);
      analysisCountRef.current = saved.analyses.length;
      setPersistedWorksheet(saved.worksheet);
      const kept = mergeDirtyWorksheet(
        worksheetRef.current,
        sent,
        saved.worksheet
      );
      if (!worksheetsEqual(kept, worksheetRef.current)) {
        setWorksheet(kept);
      }
      return kept;
    },
    []
  );

  const beaconSerialize = useCallback(
    (nextWorksheet: WorksheetData) =>
      JSON.stringify({
        worksheet: nextWorksheet,
        version: versionRef.current,
      }),
    []
  );

  const serializeWorksheet = useCallback(
    (nextWorksheet: WorksheetData) => JSON.stringify(normalizeWorksheet(nextWorksheet)),
    []
  );

  const onSave = useCallback(
    async (value: WorksheetData, context?: { signal?: AbortSignal }) => {
      const persist = (worksheet: WorksheetData, version: number) =>
        patchReportAnalytics(
          reportId,
          { worksheet, version },
          context?.signal
        );
      try {
        const next = await persist(value, versionRef.current);
        return applySavedWorksheet(next, value);
      } catch (error) {
        if (context?.signal?.aborted) throw error;
        if (error instanceof AnalyticsConflictError) {
          const merged = mergeDirtyWorksheet(
            worksheetRef.current,
            persistedRef.current,
            error.analytics.worksheet
          );
          try {
            const saved = await persist(merged, error.analytics.version);
            return applySavedWorksheet(saved, merged);
          } catch (retryError) {
            if (context?.signal?.aborted) throw retryError;
            ingestRemote(error.analytics);
            if (retryError instanceof AnalyticsConflictError) throw retryError;
            toast.error(
              retryError instanceof Error
                ? retryError.message
                : "Could not save the worksheet."
            );
            throw retryError;
          }
        }
        toast.error(
          error instanceof Error ? error.message : "Could not save the worksheet."
        );
        throw error;
      }
    },
    [applySavedWorksheet, ingestRemote, reportId]
  );

  const { status, flush, markPersisted } = useAutoSave({
    // Version is sent on PATCH / beacon only. Including it in `value` made
    // every successful save look dirty (version N → N+1) and loop Saving….
    value: worksheet,
    onSave,
    enabled: !readOnly && !loading && !agentBusy,
    beaconUrl: `/api/reports/${encodeURIComponent(reportId)}/analytics`,
    serialize: serializeWorksheet,
    beaconSerialize,
  });
  useLayoutEffect(() => {
    markPersistedRef.current = markPersisted;
  }, [markPersisted]);

  const displayedAnalyses = withLocalStale(
    analyses,
    worksheet,
    persistedWorksheet
  );
  const selectedAnalysis =
    displayedAnalyses.find((item) => item.id === selectedAnalysisId) ??
    displayedAnalyses[0] ??
    null;
  const editingAnalysis =
    editingAnalysisId != null
      ? displayedAnalyses.find((item) => item.id === editingAnalysisId) ?? null
      : null;

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

  const beginRenameSheet = useCallback(
    (sheetId: string) => {
      if (readOnly) return;
      const sheet = worksheet.sheets.find((item) => item.id === sheetId);
      if (!sheet) return;
      setEditingSheetId(sheetId);
      setSheetNameDraft(sheet.name);
    },
    [readOnly, worksheet.sheets]
  );

  const commitSheetRename = useCallback(() => {
    if (editingSheetId === null) return;
    setWorksheet((current) => renameDataSheet(current, editingSheetId, sheetNameDraft));
    setEditingSheetId(null);
  }, [editingSheetId, sheetNameDraft]);

  const cancelSheetRename = useCallback(() => {
    setEditingSheetId(null);
  }, []);

  const openAnalysisEdit = useCallback(
    (analysis: StatisticalAnalysisSummary) => {
      if (readOnly) return;
      setEditingAnalysisId(analysis.id);
      if (isSixpackAnalysis(analysis)) {
        setCapabilityColumnId(analysis.config.columnId);
        setCapabilityRowStart(analysis.config.rowStart ?? null);
        setCapabilityRowEnd(analysis.config.rowEnd ?? null);
        setCapabilityError(null);
        setCapabilityOpen(true);
        return;
      }
      if (isAnovaAnalysis(analysis)) {
        setAnovaResponseColumnId(analysis.config.responseColumnId);
        setAnovaRowStart(analysis.config.rowStart ?? null);
        setAnovaRowEnd(analysis.config.rowEnd ?? null);
        setAnovaError(null);
        setAnovaOpen(true);
        return;
      }
      if (isXyScatterAnalysis(analysis)) {
        setXyYColumnId(analysis.config.yColumnId);
        setXyRowStart(analysis.config.rowStart ?? null);
        setXyRowEnd(analysis.config.rowEnd ?? null);
        setXyError(null);
        setXyOpen(true);
        return;
      }
      if (isScatterAnalysis(analysis)) {
        setPlotError(null);
        setPlotOpen(true);
      }
    },
    [readOnly]
  );

  const clearAnalysisEdit = useCallback(() => {
    setEditingAnalysisId(null);
  }, []);

  const recomputeSelectedAnalysis = useCallback(
    async (analysis: StatisticalAnalysisSummary) => {
      if (readOnly) return;
      setRecomputingAnalysisId(analysis.id);
      try {
        await flush().catch(() => undefined);
        const next = await recomputeAnalysis(reportId, analysis.id);
        applyAnalytics(next, { selectAnalysisId: analysis.id });
        toast.success("Analysis recomputed.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not recompute the analysis."
        );
      } finally {
        setRecomputingAnalysisId(null);
      }
    },
    [applyAnalytics, flush, readOnly, reportId]
  );

  useEffect(() => {
    if (editingSheetId !== null) sheetNameInputRef.current?.focus();
  }, [editingSheetId]);

  const openAnalyzeForColumn = async (
    columnId: string,
    rows: { start: number; end: number } | null = null
  ) => {
    if (readOnly) return;
    await flush().catch(() => undefined);
    setEditingAnalysisId(null);
    setAnalyzeColumnId(columnId);
    setAnalyzeRowStart(rows?.start ?? null);
    setAnalyzeRowEnd(rows?.end ?? null);
    setAnalyzeError(null);
    setAnalyzeOpen(true);
  };

  const openSixpackForColumn = async (
    columnId: string,
    rows: { start: number; end: number } | null = null
  ) => {
    if (readOnly) return;
    await flush().catch(() => undefined);
    setEditingAnalysisId(null);
    setCapabilityColumnId(columnId);
    setCapabilityRowStart(rows?.start ?? null);
    setCapabilityRowEnd(rows?.end ?? null);
    setCapabilityError(null);
    setCapabilityOpen(true);
  };

  const openPlotMeasurements = async () => {
    if (readOnly) return;
    await flush().catch(() => undefined);
    setEditingAnalysisId(null);
    setPlotError(null);
    setPlotOpen(true);
  };

  const openOneWayAnova = async (
    columnId: string,
    rows: { start: number; end: number } | null = null
  ) => {
    if (readOnly) return;
    await flush().catch(() => undefined);
    setEditingAnalysisId(null);
    setAnovaResponseColumnId(columnId);
    setAnovaRowStart(rows?.start ?? null);
    setAnovaRowEnd(rows?.end ?? null);
    setAnovaError(null);
    setAnovaOpen(true);
  };

  const openXyScatter = async (
    columnId: string,
    rows: { start: number; end: number } | null = null
  ) => {
    if (readOnly) return;
    await flush().catch(() => undefined);
    setEditingAnalysisId(null);
    setXyYColumnId(columnId);
    setXyRowStart(rows?.start ?? null);
    setXyRowEnd(rows?.end ?? null);
    setXyError(null);
    setXyOpen(true);
  };

  const insertColumnAt = (atIndex: number) => {
    setWorksheet((current) => insertColumn(current, atIndex));
    setSelection((sel) => collapseSelection(atIndex, sel.row));
  };

  const removeColumnAt = (colIndex: number) => {
    setWorksheet((current) => {
      const next = deleteColumn(current, colIndex);
      const maxCol = Math.max(0, next.columns.length - 1);
      setSelection((sel) =>
        collapseSelection(Math.min(colIndex, maxCol), sel.row)
      );
      return next;
    });
  };

  const handleColumnMenuAction = (action: ColumnMenuAction, colIndex: number) => {
    const column = worksheet.columns[colIndex];
    if (!column) return;
    setSelection((sel) => collapseSelection(colIndex, sel.row));
    switch (action) {
      case "insert-left":
        insertColumnAt(colIndex);
        return;
      case "insert-right":
        insertColumnAt(colIndex + 1);
        return;
      case "delete":
        removeColumnAt(colIndex);
        return;
      case "clear":
        setWorksheet((current) => clearColumn(current, colIndex));
        return;
      case "specs":
        window.setTimeout(() => setSpecsColumnId(column.id), 0);
        return;
      case "analyze":
        window.setTimeout(() => {
          void openAnalyzeForColumn(column.id, null);
        }, 0);
        return;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
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
            <span
              data-testid="analytics-save-status"
              className="text-xs text-[var(--muted-foreground)]"
            >
              {readOnly ? "View only" : saveLabel(status)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <WorkspaceMenubar
              readOnly={readOnly}
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
              onXyScatter={() =>
                void openXyScatter(selectedColumnId, selectedRowRange)
              }
              onPlotMeasurements={() => void openPlotMeasurements()}
              onAddDataSheet={() => {
                setWorksheet((current) => addDataSheet(current));
                setSelection(collapseSelection(0, 0));
              }}
              onRenameDataSheet={() => beginRenameSheet(worksheet.activeSheetId)}
            />
            {readOnly ? null : (
              <Button
                type="button"
                size="sm"
                data-testid="analyze-selected-column"
                disabled={!selectedColumnId}
                onClick={() =>
                  void openAnalyzeForColumn(selectedColumnId, selectedRowRange)
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
                const editing = editingSheetId === sheet.id;
                return editing ? (
                  <input
                    key={sheet.id}
                    ref={sheetNameInputRef}
                    value={sheetNameDraft}
                    aria-label="Data sheet name"
                    data-testid={`worksheet-sheet-rename-${sheet.id}`}
                    className="h-7 max-w-[10rem] rounded-md border border-[var(--ring)] bg-[var(--input)] px-2 text-xs font-medium"
                    onChange={(event) => setSheetNameDraft(event.target.value)}
                    onBlur={commitSheetRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitSheetRename();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelSheetRename();
                      }
                    }}
                  />
                ) : (
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
                    onDoubleClick={() => beginRenameSheet(sheet.id)}
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
              onColumnMenuAction={handleColumnMenuAction}
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
                <strong>Stat → One-Way ANOVA</strong>,{" "}
                <strong>Stat → Scatter</strong> for two worksheet columns, or{" "}
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
                        void openAnalyzeForColumn(
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
                            {analysis.stale ? "Stale · " : ""}
                            {new Date(analysis.createdAt).toLocaleString()}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>
              <div className="min-w-0 flex-1 overflow-hidden">
                {selectedAnalysis &&
                (isScatterAnalysis(selectedAnalysis) ||
                  isXyScatterAnalysis(selectedAnalysis)) ? (
                  <ScatterView
                    analysis={selectedAnalysis}
                    reportId={reportId}
                    onPreviewUploaded={applyAnalytics}
                    readOnly={readOnly}
                    editing={Boolean(editingAnalysisId)}
                    recomputing={recomputingAnalysisId === selectedAnalysis.id}
                    onRecompute={() => void recomputeSelectedAnalysis(selectedAnalysis)}
                    onEdit={() => openAnalysisEdit(selectedAnalysis)}
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
                    editing={Boolean(editingAnalysisId)}
                    recomputing={recomputingAnalysisId === selectedAnalysis.id}
                    onRecompute={() => void recomputeSelectedAnalysis(selectedAnalysis)}
                    onEdit={() => openAnalysisEdit(selectedAnalysis)}
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
                    reportId={reportId}
                    onPreviewUploaded={applyAnalytics}
                    readOnly={readOnly}
                    editing={Boolean(editingAnalysisId)}
                    recomputing={recomputingAnalysisId === selectedAnalysis.id}
                    onRecompute={() => void recomputeSelectedAnalysis(selectedAnalysis)}
                    onEdit={() => openAnalysisEdit(selectedAnalysis)}
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

      <AnalyzeDialog
        key={analyzeOpen ? "analyze-open" : "analyze-closed"}
        open={analyzeOpen}
        worksheet={worksheet}
        defaultColumnId={analyzeColumnId || selectedColumnId}
        defaultRowStart={analyzeRowStart}
        defaultRowEnd={analyzeRowEnd}
        submitting={analyzeSubmitting}
        error={analyzeError}
        onOpenChange={setAnalyzeOpen}
        onSubmit={async (payload) => {
          setAnalyzeSubmitting(true);
          setAnalyzeError(null);
          try {
            await flush().catch(() => undefined);
            if (payload.kind === ONE_WAY_ANOVA) {
              const created = await createOneWayAnova(reportId, {
                responseColumnId: payload.values.responseColumnId,
                factorColumnId: payload.values.factorColumnId,
                title: payload.values.title || undefined,
                rowStart: payload.values.rowStart,
                rowEnd: payload.values.rowEnd,
              });
              applyAnalytics(created.analytics, {
                selectAnalysisId: created.analysisId,
              });
            } else if (payload.kind === MEASUREMENT_SCATTER) {
              const created = await createMeasurementScatter(reportId, {
                query: payload.values.query,
                title: payload.values.title || undefined,
                xLabel: payload.values.xLabel || undefined,
                yLabel: payload.values.yLabel || undefined,
                layout: { mode: payload.values.mode },
                lsl: payload.values.lsl,
                usl: payload.values.usl,
              });
              applyAnalytics(created.analytics, {
                selectAnalysisId: created.analysisId,
              });
            } else {
              const created = await createCapabilitySixpack(reportId, {
                columnId: payload.values.columnId,
                title: payload.values.title || undefined,
                lsl: payload.values.lsl,
                usl: payload.values.usl,
                target: payload.values.target,
                rowStart: payload.values.rowStart,
                rowEnd: payload.values.rowEnd,
              });
              applyAnalytics(created.analytics, {
                selectAnalysisId: created.analysisId,
              });
            }
            setAnalyzeOpen(false);
            setTab("results");
          } catch (error) {
            setAnalyzeError(
              error instanceof Error
                ? error.message
                : "Could not run the analysis."
            );
          } finally {
            setAnalyzeSubmitting(false);
          }
        }}
      />

      <CapabilityDialog
        key={
          capabilityOpen
            ? `capability-${editingAnalysisId ?? "new"}`
            : "capability-closed"
        }
        open={capabilityOpen}
        worksheet={worksheet}
        defaultColumnId={capabilityColumnId || selectedColumnId}
        defaultRowStart={capabilityRowStart}
        defaultRowEnd={capabilityRowEnd}
        defaultTitle={
          editingAnalysis && isSixpackAnalysis(editingAnalysis)
            ? editingAnalysis.config.title
            : ""
        }
        defaultLsl={
          editingAnalysis && isSixpackAnalysis(editingAnalysis)
            ? editingAnalysis.config.lsl
            : null
        }
        defaultUsl={
          editingAnalysis && isSixpackAnalysis(editingAnalysis)
            ? editingAnalysis.config.usl
            : null
        }
        defaultTarget={
          editingAnalysis && isSixpackAnalysis(editingAnalysis)
            ? editingAnalysis.config.target
            : null
        }
        editMode={Boolean(
          editingAnalysis && isSixpackAnalysis(editingAnalysis)
        )}
        submitting={capabilitySubmitting}
        error={capabilityError}
        onOpenChange={(open) => {
          setCapabilityOpen(open);
          if (!open) clearAnalysisEdit();
        }}
        onSubmit={async (values) => {
          setCapabilitySubmitting(true);
          setCapabilityError(null);
          try {
            await flush().catch(() => undefined);
            if (editingAnalysisId && isSixpackAnalysis(editingAnalysis!)) {
              const next = await updateAnalysis(reportId, editingAnalysisId, {
                columnId: values.columnId,
                title: values.title || undefined,
                lsl: values.lsl,
                usl: values.usl,
                target: values.target,
                rowStart: values.rowStart,
                rowEnd: values.rowEnd,
              });
              applyAnalytics(next, { selectAnalysisId: editingAnalysisId });
              toast.success("Sixpack updated.");
            } else {
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
            }
            setCapabilityOpen(false);
            clearAnalysisEdit();
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
        key={
          anovaOpen ? `anova-${editingAnalysisId ?? "new"}` : "anova-closed"
        }
        open={anovaOpen}
        worksheet={worksheet}
        defaultResponseColumnId={anovaResponseColumnId || selectedColumnId}
        defaultFactorColumnId={
          editingAnalysis && isAnovaAnalysis(editingAnalysis)
            ? editingAnalysis.config.factorColumnId
            : undefined
        }
        defaultRowStart={anovaRowStart}
        defaultRowEnd={anovaRowEnd}
        defaultTitle={
          editingAnalysis && isAnovaAnalysis(editingAnalysis)
            ? editingAnalysis.config.title
            : ""
        }
        editMode={Boolean(editingAnalysis && isAnovaAnalysis(editingAnalysis))}
        submitting={anovaSubmitting}
        error={anovaError}
        onOpenChange={(open) => {
          setAnovaOpen(open);
          if (!open) clearAnalysisEdit();
        }}
        onSubmit={async (values) => {
          setAnovaSubmitting(true);
          setAnovaError(null);
          try {
            await flush().catch(() => undefined);
            if (editingAnalysisId && isAnovaAnalysis(editingAnalysis!)) {
              const next = await updateAnalysis(reportId, editingAnalysisId, {
                responseColumnId: values.responseColumnId,
                factorColumnId: values.factorColumnId,
                title: values.title || undefined,
                rowStart: values.rowStart,
                rowEnd: values.rowEnd,
              });
              applyAnalytics(next, { selectAnalysisId: editingAnalysisId });
              toast.success("ANOVA updated.");
            } else {
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
            }
            setAnovaOpen(false);
            clearAnalysisEdit();
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

      <XyScatterDialog
        key={xyOpen ? `xy-${editingAnalysisId ?? "new"}` : "xy-closed"}
        open={xyOpen}
        worksheet={worksheet}
        defaultYColumnId={xyYColumnId || selectedColumnId}
        defaultXColumnId={
          editingAnalysis && isXyScatterAnalysis(editingAnalysis)
            ? editingAnalysis.config.xColumnId
            : undefined
        }
        defaultRowStart={xyRowStart}
        defaultRowEnd={xyRowEnd}
        defaultTitle={
          editingAnalysis && isXyScatterAnalysis(editingAnalysis)
            ? editingAnalysis.config.title
            : ""
        }
        editMode={Boolean(
          editingAnalysis && isXyScatterAnalysis(editingAnalysis)
        )}
        submitting={xySubmitting}
        error={xyError}
        onOpenChange={(open) => {
          setXyOpen(open);
          if (!open) clearAnalysisEdit();
        }}
        onSubmit={async (values) => {
          setXySubmitting(true);
          setXyError(null);
          try {
            await flush().catch(() => undefined);
            if (editingAnalysisId && isXyScatterAnalysis(editingAnalysis!)) {
              const next = await updateAnalysis(reportId, editingAnalysisId, {
                xColumnId: values.xColumnId,
                yColumnId: values.yColumnId,
                title: values.title || undefined,
                rowStart: values.rowStart,
                rowEnd: values.rowEnd,
              });
              applyAnalytics(next, { selectAnalysisId: editingAnalysisId });
              toast.success("Scatter updated.");
            } else {
              const created = await createXyScatter(reportId, {
                xColumnId: values.xColumnId,
                yColumnId: values.yColumnId,
                title: values.title || undefined,
                rowStart: values.rowStart,
                rowEnd: values.rowEnd,
              });
              applyAnalytics(created.analytics, {
                selectAnalysisId: created.analysisId,
              });
            }
            setXyOpen(false);
            clearAnalysisEdit();
            setTab("results");
          } catch (error) {
            setXyError(
              error instanceof Error
                ? error.message
                : "Could not plot the scatter."
            );
          } finally {
            setXySubmitting(false);
          }
        }}
      />

      <PlotMeasurementsDialog
        key={
          plotOpen ? `plot-${editingAnalysisId ?? "new"}` : "plot-closed"
        }
        open={plotOpen}
        defaultQuery={
          editingAnalysis && isScatterAnalysis(editingAnalysis)
            ? editingAnalysis.config.query
            : ""
        }
        defaultTitle={
          editingAnalysis && isScatterAnalysis(editingAnalysis)
            ? editingAnalysis.config.title
            : ""
        }
        defaultXLabel={
          editingAnalysis && isScatterAnalysis(editingAnalysis)
            ? editingAnalysis.config.xLabel
            : ""
        }
        defaultYLabel={
          editingAnalysis && isScatterAnalysis(editingAnalysis)
            ? editingAnalysis.config.yLabel
            : ""
        }
        defaultMode={
          editingAnalysis && isScatterAnalysis(editingAnalysis)
            ? editingAnalysis.config.layout.mode
            : "combined"
        }
        defaultLsl={
          editingAnalysis && isScatterAnalysis(editingAnalysis)
            ? editingAnalysis.config.lsl
            : null
        }
        defaultUsl={
          editingAnalysis && isScatterAnalysis(editingAnalysis)
            ? editingAnalysis.config.usl
            : null
        }
        editMode={Boolean(
          editingAnalysis && isScatterAnalysis(editingAnalysis)
        )}
        submitting={plotSubmitting}
        error={plotError}
        onOpenChange={(open) => {
          setPlotOpen(open);
          if (!open) clearAnalysisEdit();
        }}
        onSubmit={async (values) => {
          setPlotSubmitting(true);
          setPlotError(null);
          try {
            await flush().catch(() => undefined);
            if (editingAnalysisId && isScatterAnalysis(editingAnalysis!)) {
              const next = await updateAnalysis(reportId, editingAnalysisId, {
                query: values.query,
                title: values.title || undefined,
                xLabel: values.xLabel || undefined,
                yLabel: values.yLabel || undefined,
                layout: { mode: values.mode },
                lsl: values.lsl,
                usl: values.usl,
              });
              applyAnalytics(next, { selectAnalysisId: editingAnalysisId });
              toast.success("Measurement scatter updated.");
            } else {
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
            }
            setPlotOpen(false);
            clearAnalysisEdit();
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
