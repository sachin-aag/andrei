"use client";

import { useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { useReportData, useReportEditors } from "@/providers/report-provider";
import { isTrackChangesFieldEditable } from "@/lib/reports/section-save-policy";
import { AdvancedFormattingToolbar } from "@/components/report/advanced-formatting-toolbar";
import { TrackChangesToggle } from "@/components/report/track-changes-toggle";
import {
  FontColorToolbar,
  InsertImageButton,
  InsertTableButton,
  ListEditToolbar,
  TextFormatToolbar,
  useEditorToolbarState,
} from "@/components/report/editor-toolbars";

const FIELD_LABELS: Record<string, string> = {
  "define:narrative": "Details of Investigation (Narrative)",
  "measure:narrative": "Measurement Narrative",
  "analyze:fiveWhy.narrative": "5-Why analysis",
  "analyze:investigationOutcome": "Investigation Outcome",
  "analyze:rootCause.narrative": "Root cause narrative",
  "analyze:impactAssessment": "Impact assessment",
  "improve:correctiveActions": "Corrective Action",
  "control:preventiveActions": "Preventive actions",
  "analyze:sixM.man": "6M · Man",
  "analyze:sixM.machine": "6M · Machine",
  "analyze:sixM.measurement": "6M · Measurement",
  "analyze:sixM.material": "6M · Material",
  "analyze:sixM.method": "6M · Method",
  "analyze:sixM.milieu": "6M · Milieu (Environment)",
  "analyze:sixM.conclusion": "6M Conclusion",
  "analyze:brainstorming": "Brainstorming",
  "analyze:otherTools": "Other Tools",
};

function activeFieldLabel(activeFieldKey: string | null): string | null {
  if (!activeFieldKey) return null;
  return FIELD_LABELS[activeFieldKey] ?? activeFieldKey.replace(":", " · ");
}

export function ReportEditorToolbar() {
  const { readOnly, trackChangesMode, setTrackChangesMode, workspaceMode } =
    useReportData();
  const { activeFieldKey, activeFieldKind, getActiveEditor } = useReportEditors();
  const editor = getActiveEditor();
  useEditorToolbarState(editor);

  const fieldLabel = useMemo(
    () => activeFieldLabel(activeFieldKey),
    [activeFieldKey]
  );

  // Read-only surfaces get no toolbar. Managers do, even before they turn track
  // changes on — otherwise the toggle would be unreachable from review mode.
  if (workspaceMode === "view") return null;

  const canFormat =
    isTrackChangesFieldEditable({ readOnly, trackChangesMode }) &&
    activeFieldKey &&
    activeFieldKind === "rich" &&
    editor;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-6 py-1.5"
      role="toolbar"
      aria-label="Editing"
    >
      <TrackChangesToggle
        checked={trackChangesMode}
        onCheckedChange={setTrackChangesMode}
      />
      <Separator orientation="vertical" className="h-5" />

      {fieldLabel ? (
        <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
          Editing: {fieldLabel}
        </span>
      ) : (
        <span className="text-xs text-[var(--muted-foreground)]">
          Select a field to start editing.
        </span>
      )}

      {canFormat ? (
        <>
          <Separator orientation="vertical" className="h-5 hidden sm:block" />
          <TextFormatToolbar editor={editor} />
          <Separator orientation="vertical" className="h-5" />
          <FontColorToolbar editor={editor} />
          <Separator orientation="vertical" className="h-5" />
          <ListEditToolbar editor={editor} />
          <Separator orientation="vertical" className="h-5" />
          <AdvancedFormattingToolbar editor={editor} />
          <Separator orientation="vertical" className="h-5" />
          <InsertImageButton editor={editor} />
          <Separator orientation="vertical" className="h-5" />
          <InsertTableButton editor={editor} />
          {editor.isActive("table") ? (
            <span className="text-[10px] text-[var(--muted-foreground)]">
              Table tools float above the cell
            </span>
          ) : null}
        </>
      ) : null}

      {activeFieldKey && activeFieldKind === "plain" ? (
        <span className="text-[10px] text-[var(--muted-foreground)]">
          Plain text — formatting, tables, and equations are not available in this field.
        </span>
      ) : null}
    </div>
  );
}
