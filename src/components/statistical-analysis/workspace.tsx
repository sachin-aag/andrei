"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutoSave, type SaveStatus } from "@/hooks/use-auto-save";
import {
  createCapabilitySixpack,
  deleteCapabilitySixpack,
  deleteStatisticalWorkspace,
  patchStatisticalWorkspace,
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
  StatisticalAnalysisSummary,
  StatisticalWorkspaceView,
  WorksheetData,
} from "@/lib/statistical-analysis/types";
import { CapabilityDialog } from "@/components/statistical-analysis/capability-dialog";
import { SixpackView } from "@/components/statistical-analysis/sixpack-view";
import {
  WorksheetGrid,
  type GridSelection,
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
  initial,
}: {
  initial: StatisticalWorkspaceView;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [worksheet, setWorksheet] = useState(initial.worksheet);
  const [persistedWorksheet, setPersistedWorksheet] = useState(initial.worksheet);
  const [analyses, setAnalyses] = useState(initial.analyses);
  const [selection, setSelection] = useState<GridSelection>({ col: 0, row: 0 });
  const [tab, setTab] = useState("worksheet");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(
    initial.analyses[0]?.id ?? null
  );
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [capabilitySubmitting, setCapabilitySubmitting] = useState(false);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(initial.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const applyWorkspace = useCallback((next: StatisticalWorkspaceView) => {
    setName(next.name);
    setWorksheet(next.worksheet);
    setPersistedWorksheet(next.worksheet);
    setAnalyses(next.analyses);
  }, []);

  const autoSaveValue = useMemo(
    () => ({ name, worksheet }),
    [name, worksheet]
  );

  const onSave = useCallback(
    async (
      value: { name: string; worksheet: WorksheetData },
      context?: { signal?: AbortSignal }
    ) => {
      try {
        const next = await patchStatisticalWorkspace(
          initial.id,
          value,
          context?.signal
        );
        setPersistedWorksheet(next.worksheet);
        setAnalyses(next.analyses);
        setName(next.name);
      } catch (error) {
        if (context?.signal?.aborted) throw error;
        toast.error(
          error instanceof Error ? error.message : "Could not save the worksheet."
        );
        throw error;
      }
    },
    [initial.id]
  );

  const { status, flush } = useAutoSave({
    value: autoSaveValue,
    onSave,
    beaconUrl: `/api/statistical-analysis/workspaces/${initial.id}`,
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
    await flush().catch(() => undefined);
    setCapabilityError(null);
    setCapabilityOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[var(--border)] px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/statistical-analysis"
              className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <ArrowLeft className="size-3.5" />
              Worksheets
            </Link>
            <h1 className="truncate text-sm font-semibold">{name}</h1>
            <span className="text-xs text-[var(--muted-foreground)]">
              {saveLabel(status)}
            </span>
          </div>
          <WorkspaceMenubar
            onRename={() => {
              setRenameDraft(name);
              setRenameOpen(true);
            }}
            onDelete={() => setDeleteOpen(true)}
            onClose={() => router.push("/statistical-analysis")}
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
          />
        </TabsContent>

        <TabsContent
          value="results"
          className="mt-0 hidden min-h-0 flex-1 overflow-hidden data-[state=active]:flex"
        >
          {displayedAnalyses.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="max-w-md text-sm text-[var(--muted-foreground)]">
                Run <strong>Stat → Quality Tools → Capability Sixpack → Normal</strong>{" "}
                to analyze a worksheet column.
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
                          {analysis.stale ? "Stale · " : ""}
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
                    recomputing={recomputing}
                    onRecompute={async () => {
                      setRecomputing(true);
                      try {
                        await flush().catch(() => undefined);
                        const next = await recomputeCapabilitySixpack(
                          initial.id,
                          selectedAnalysis.id
                        );
                        applyWorkspace(next);
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
                          initial.id,
                          selectedAnalysis.id
                        );
                        applyWorkspace(next);
                        setSelectedAnalysisId(next.analyses[0]?.id ?? null);
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
            const next = await createCapabilitySixpack(initial.id, {
              columnId: values.columnId,
              title: values.title || undefined,
              lsl: values.lsl,
              usl: values.usl,
              target: values.target,
            });
            applyWorkspace(next);
            setSelectedAnalysisId(next.analyses[0]?.id ?? null);
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

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename worksheet</DialogTitle>
            <DialogDescription>
              The name appears in the worksheet list and the workspace header.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label
              htmlFor="worksheet-name"
              className="normal-case tracking-normal text-sm font-medium text-[var(--foreground)]"
            >
              Name
            </Label>
            <Input
              id="worksheet-name"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const next = renameDraft.trim();
                if (!next) {
                  toast.error("Enter a worksheet name.");
                  return;
                }
                setName(next);
                setRenameOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete worksheet?</DialogTitle>
            <DialogDescription>
              This permanently deletes {name} and its analyses.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteStatisticalWorkspace(initial.id);
                  router.push("/statistical-analysis");
                  router.refresh();
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not delete the worksheet."
                  );
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
