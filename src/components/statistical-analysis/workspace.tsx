"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutoSave, type SaveStatus } from "@/hooks/use-auto-save";
import {
  createCapabilitySixpack,
  deleteCapabilitySixpack,
  getReportAnalytics,
  patchReportAnalytics,
  recomputeCapabilitySixpack,
} from "@/lib/statistical-analysis/client";
import { applySampleAssay } from "@/lib/statistical-analysis/sample-data";
import {
  columnSourceKey,
  deleteColumn,
  deleteRow,
  findColumn,
  insertColumn,
  insertRow,
} from "@/lib/statistical-analysis/worksheet";
import type {
  ReportAnalyticsView,
  StatisticalAnalysisSummary,
  WorksheetData,
} from "@/lib/statistical-analysis/types";
import { CapabilityDialog } from "@/components/statistical-analysis/capability-dialog";
import { SixpackView } from "@/components/statistical-analysis/sixpack-view";
import {
  WorksheetGrid,
  type GridSelection,
} from "@/components/statistical-analysis/worksheet-grid";
import { WorkspaceMenubar } from "@/components/statistical-analysis/workspace-menubar";
import { createEmptyWorksheet } from "@/lib/statistical-analysis/worksheet";

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

function withLocalStale(
  analyses: StatisticalAnalysisSummary[],
  worksheet: WorksheetData,
  persisted: WorksheetData
): StatisticalAnalysisSummary[] {
  return analyses.map((analysis) => {
    const current = findColumn(worksheet, analysis.config.columnId);
    const saved = findColumn(persisted, analysis.config.columnId);
    if (!current) return { ...analysis, stale: true };
    if (!saved) return analysis;
    const changed = columnSourceKey(current) !== columnSourceKey(saved);
    return { ...analysis, stale: analysis.stale || changed };
  });
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
  const [selection, setSelection] = useState<GridSelection>({ col: 0, row: 0 });
  const [tab, setTab] = useState("worksheet");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [capabilitySubmitting, setCapabilitySubmitting] = useState(false);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const analysisCountRef = useRef(0);

  const applyAnalytics = useCallback((next: ReportAnalyticsView) => {
    setWorksheet(next.worksheet);
    setPersistedWorksheet(next.worksheet);
    setAnalyses(next.analyses);
    analysisCountRef.current = next.analyses.length;
    setSelectedAnalysisId((current) => {
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

  const selectedColumnId =
    worksheet.columns[selection.col]?.id ?? worksheet.columns[0]?.id ?? "";

  const handleNormalSixpack = async () => {
    if (readOnly) return;
    await flush().catch(() => undefined);
    setCapabilityError(null);
    setCapabilityOpen(true);
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
          <WorkspaceMenubar
            readOnly={readOnly}
            onInsertColumn={() => {
              setWorksheet((current) => insertColumn(current, selection.col));
            }}
            onDeleteColumn={() => {
              setWorksheet((current) => {
                const next = deleteColumn(current, selection.col);
                setSelection((sel) => ({
                  ...sel,
                  col: Math.min(sel.col, next.columns.length - 1),
                }));
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
              toast.success("Loaded sample assay measurements into the selected column.");
            }}
            onNormalSixpack={() => void handleNormalSixpack()}
          />
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
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="worksheet"
          className="mt-0 min-h-0 flex-1 overflow-hidden"
        >
          <WorksheetGrid
            worksheet={worksheet}
            selection={selection}
            onSelectionChange={setSelection}
            onChange={setWorksheet}
            readOnly={readOnly}
          />
        </TabsContent>

        <TabsContent
          value="results"
          className="mt-0 hidden min-h-0 flex-1 overflow-hidden data-[state=active]:flex"
        >
          {displayedAnalyses.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="max-w-md text-sm text-[var(--muted-foreground)]">
                Run <strong>Stat → Normal Capability Sixpack…</strong> to analyze
                a worksheet column, or ask the assistant to extract numbers from
                attachments and plot them.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1">
              <aside
                data-testid="analysis-list"
                className="w-56 shrink-0 overflow-y-auto border-r border-[var(--border)] p-2"
              >
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Analyses
                </p>
                <ul className="space-y-1">
                  {displayedAnalyses.map((analysis) => (
                    <li key={analysis.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAnalysisId(analysis.id)}
                        className={`w-full rounded-md px-2 py-2 text-left text-xs transition-colors ${
                          selectedAnalysis?.id === analysis.id
                            ? "bg-[var(--brand-700)] text-white"
                            : "hover:bg-[var(--secondary)]"
                        }`}
                      >
                        <span className="block font-medium">{analysis.title}</span>
                        <span
                          className={`block ${
                            selectedAnalysis?.id === analysis.id
                              ? "text-white/80"
                              : "text-[var(--muted-foreground)]"
                          }`}
                        >
                          {analysis.stale ? "Needs recompute · " : ""}
                          {new Date(analysis.createdAt).toLocaleString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
              <div className="min-w-0 flex-1 overflow-hidden">
                {selectedAnalysis ? (
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
        defaultColumnId={selectedColumnId}
        submitting={capabilitySubmitting}
        error={capabilityError}
        onOpenChange={setCapabilityOpen}
        onSubmit={async (values) => {
          setCapabilitySubmitting(true);
          setCapabilityError(null);
          try {
            await flush().catch(() => undefined);
            const next = await createCapabilitySixpack(reportId, {
              columnId: values.columnId,
              title: values.title || undefined,
              lsl: values.lsl,
              usl: values.usl,
              target: values.target,
            });
            applyAnalytics(next);
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
    </div>
  );
}
