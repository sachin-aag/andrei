"use client";

import { useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { useReportData, useReportEditors } from "@/providers/report-provider";
import { AdvancedFormattingToolbar } from "@/components/report/advanced-formatting-toolbar";
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
};

function activeFieldLabel(activeEditorKey: string | null): string | null {
  if (!activeEditorKey) return null;
  return FIELD_LABELS[activeEditorKey] ?? activeEditorKey.replace(":", " · ");
}

export function ReportEditorToolbar() {
  const { readOnly } = useReportData();
  const { activeEditorKey, getActiveEditor } = useReportEditors();
  const editor = getActiveEditor();
  useEditorToolbarState(editor);

  const fieldLabel = useMemo(
    () => activeFieldLabel(activeEditorKey),
    [activeEditorKey]
  );

  if (readOnly || !editor) return null;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-6 py-1.5"
      role="toolbar"
      aria-label="Text formatting"
    >
      {fieldLabel ? (
        <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
          Editing: {fieldLabel}
        </span>
      ) : null}
      {fieldLabel ? (
        <Separator orientation="vertical" className="h-5 hidden sm:block" />
      ) : null}
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
    </div>
  );
}
