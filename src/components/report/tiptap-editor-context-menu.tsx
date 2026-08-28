"use client";

import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { parseChartSpec } from "@/lib/charts/chart-spec";
import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import {
  clipboardErrorMessage,
  copyEditorSelection,
  cutEditorSelection,
  deleteEditorSelection,
  editorHasSelection,
  pasteEditorClipboard,
} from "@/lib/tiptap/editor-clipboard";
import {
  fetchAnalysisImage,
  getReportAnalytics,
} from "@/lib/statistical-analysis/client";
import { analysisListSubtitle } from "@/lib/statistical-analysis/stale";
import { listInsertableGraphAnalyses } from "@/lib/statistical-analysis/insertable-graphs";
import type { StatisticalAnalysisSummary } from "@/lib/statistical-analysis/types";

type TiptapEditorContextMenuProps = {
  editor: Editor | null;
  editable: boolean;
  reportId: string;
  children: React.ReactNode;
};

export function TiptapEditorContextMenu({
  editor,
  editable,
  reportId,
  children,
}: TiptapEditorContextMenuProps) {
  const statsEnabled = isStatisticalAnalysisEnabled();
  const [hasSelection, setHasSelection] = useState(false);
  const [graphs, setGraphs] = useState<StatisticalAnalysisSummary[] | null>(
    null
  );
  const [graphsLoading, setGraphsLoading] = useState(false);
  const [insertingAnalysisId, setInsertingAnalysisId] = useState<string | null>(
    null
  );

  const refreshMenuState = useCallback(() => {
    if (!editor) {
      setHasSelection(false);
      return;
    }
    setHasSelection(editorHasSelection(editor));
  }, [editor]);

  const loadGraphs = useCallback(async () => {
    if (!statsEnabled) return;
    setGraphsLoading(true);
    try {
      const analytics = await getReportAnalytics(reportId);
      setGraphs(listInsertableGraphAnalyses(analytics.analyses));
    } catch (error) {
      console.error(error);
      setGraphs([]);
      toast.error("Could not load Analytics graphs.");
    } finally {
      setGraphsLoading(false);
    }
  }, [reportId, statsEnabled]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) return;
      refreshMenuState();
      if (statsEnabled && editable) {
        void loadGraphs();
      }
    },
    [editable, loadGraphs, refreshMenuState, statsEnabled]
  );

  const insertGraph = useCallback(
    async (analysisId: string) => {
      if (!editor || !editable) return;
      setInsertingAnalysisId(analysisId);
      try {
        const image = await fetchAnalysisImage(reportId, analysisId);
        const chartSpec = parseChartSpec(image.chartSpec);
        const inserted = editor
          .chain()
          .focus()
          .insertImageInline({
            src: image.dataUrl,
            alt: image.alt,
            width: image.widthPx,
            chartSpec,
          })
          .run();
        if (!inserted) {
          toast.error("Could not insert the graph.");
        }
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : "Could not insert the graph."
        );
      } finally {
        setInsertingAnalysisId(null);
      }
    },
    [editable, editor, reportId]
  );

  const handleCopy = useCallback(async () => {
    if (!editor || !editable) return;
    const result = await copyEditorSelection(editor);
    if (!result.ok) {
      toast.error(clipboardErrorMessage(result.error));
    }
    refreshMenuState();
  }, [editable, editor, refreshMenuState]);

  const handleCut = useCallback(async () => {
    if (!editor || !editable) return;
    const result = await cutEditorSelection(editor);
    if (!result.ok) {
      toast.error(clipboardErrorMessage(result.error));
    }
    refreshMenuState();
  }, [editable, editor, refreshMenuState]);

  const handlePaste = useCallback(async () => {
    if (!editor || !editable) return;
    const result = await pasteEditorClipboard(editor);
    if (!result.ok) {
      toast.error(clipboardErrorMessage(result.error));
    }
    refreshMenuState();
  }, [editable, editor, refreshMenuState]);

  const handleDelete = useCallback(() => {
    if (!editor || !editable) return;
    if (!deleteEditorSelection(editor)) {
      toast.error("Nothing selected to delete.");
    }
    refreshMenuState();
  }, [editable, editor, refreshMenuState]);

  const selectionActionsDisabled = !editable || !hasSelection;
  const pasteDisabled = !editable;
  const graphMenuDisabled = !editable || !statsEnabled;

  return (
    <ContextMenu onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        data-testid="tiptap-editor-context-menu"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ContextMenuItem
          data-testid="tiptap-context-cut"
          disabled={selectionActionsDisabled}
          onSelect={() => void handleCut()}
        >
          Cut
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="tiptap-context-copy"
          disabled={selectionActionsDisabled}
          onSelect={() => void handleCopy()}
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="tiptap-context-paste"
          disabled={pasteDisabled}
          onSelect={() => void handlePaste()}
        >
          Paste
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="tiptap-context-delete"
          disabled={selectionActionsDisabled}
          variant="destructive"
          onSelect={handleDelete}
        >
          Delete
        </ContextMenuItem>

        {statsEnabled ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger
                data-testid="tiptap-context-insert-graph"
                disabled={graphMenuDisabled}
              >
                Insert graph
              </ContextMenuSubTrigger>
              <ContextMenuSubContent data-testid="tiptap-context-graph-list">
                {graphsLoading ? (
                  <ContextMenuItem disabled>Loading graphs…</ContextMenuItem>
                ) : graphs && graphs.length > 0 ? (
                  graphs.map((analysis) => (
                    <ContextMenuItem
                      key={analysis.id}
                      data-testid={`tiptap-context-graph-${analysis.id}`}
                      disabled={
                        graphMenuDisabled || insertingAnalysisId === analysis.id
                      }
                      onSelect={() => void insertGraph(analysis.id)}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-medium">
                          {analysis.title}
                        </span>
                        <span className="truncate text-xs text-[var(--muted-foreground)]">
                          {analysisListSubtitle(analysis)}
                        </span>
                      </span>
                    </ContextMenuItem>
                  ))
                ) : (
                  <ContextMenuLabel className="max-w-[18rem] whitespace-normal font-normal text-[var(--muted-foreground)]">
                    No graphs ready to insert. Open Analytics, create or open a
                    sixpack or scatter, and wait a moment for the preview to save.
                  </ContextMenuLabel>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
