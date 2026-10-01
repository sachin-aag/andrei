"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { WorksheetData, WorksheetSheet } from "@/lib/statistical-analysis/types";

export function WorksheetSheetTabs({
  worksheet,
  readOnly = false,
  editingSheetId,
  sheetNameDraft,
  onSheetNameDraftChange,
  onBeginRename,
  onCommitRename,
  onCancelRename,
  onActivate,
  onDelete,
  busySheetId = null,
}: {
  worksheet: WorksheetData;
  readOnly?: boolean;
  editingSheetId: string | null;
  sheetNameDraft: string;
  onSheetNameDraftChange: (name: string) => void;
  onBeginRename: (sheetId: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onActivate: (sheetId: string) => void;
  onDelete: (sheetId: string) => void;
  /** Sheet whose rows are still rendering, so its tab can acknowledge the click. */
  busySheetId?: string | null;
}) {
  const sheetNameInputRef = useRef<HTMLInputElement>(null);
  const canDelete = worksheet.sheets.length > 1;

  useEffect(() => {
    if (editingSheetId === null) return;
    const input = sheetNameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editingSheetId]);

  return (
    <div
      data-testid="worksheet-sheet-tabs"
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--border)] px-4 py-1.5"
    >
      {worksheet.sheets.map((sheet) => {
        const busy = busySheetId === sheet.id;
        const active = worksheet.activeSheetId === sheet.id || busy;
        const editing = editingSheetId === sheet.id;
        if (editing) {
          return (
            <input
              key={sheet.id}
              ref={sheetNameInputRef}
              value={sheetNameDraft}
              aria-label="Data sheet name"
              data-testid={`worksheet-sheet-rename-${sheet.id}`}
              className="h-7 max-w-[10rem] rounded-md border border-[var(--ring)] bg-[var(--input)] px-2 text-xs font-medium"
              onChange={(event) => onSheetNameDraftChange(event.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
            />
          );
        }
        return (
          <SheetTab
            key={sheet.id}
            sheet={sheet}
            active={active}
            busy={busy}
            readOnly={readOnly}
            canDelete={canDelete}
            onActivate={() => onActivate(sheet.id)}
            onBeginRename={() => onBeginRename(sheet.id)}
            onDelete={() => onDelete(sheet.id)}
          />
        );
      })}
      {readOnly || !canDelete ? null : (
        <button
          type="button"
          data-testid="delete-data-sheet"
          onClick={() => onDelete(worksheet.activeSheetId)}
          className="ml-auto rounded-md px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/60"
        >
          Delete sheet
        </button>
      )}
    </div>
  );
}

function SheetTab({
  sheet,
  active,
  busy,
  readOnly,
  canDelete,
  onActivate,
  onBeginRename,
  onDelete,
}: {
  sheet: WorksheetSheet;
  active: boolean;
  busy: boolean;
  readOnly: boolean;
  canDelete: boolean;
  onActivate: () => void;
  onBeginRename: () => void;
  onDelete: () => void;
}) {
  const pendingRename = useRef(false);
  const tabClass = `flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
    active
      ? "bg-[var(--secondary)] font-medium text-[var(--foreground)]"
      : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/60"
  }`;
  const tabButton = (
    <button
      type="button"
      aria-label={`${sheet.name} sheet`}
      data-testid={`worksheet-sheet-tab-${sheet.id}`}
      aria-busy={busy || undefined}
      data-switching={busy ? "true" : undefined}
      onClick={onActivate}
      onDoubleClick={onBeginRename}
      className={tabClass}
    >
      {sheet.name}
      {busy ? (
        <Loader2
          className="size-3 animate-spin"
          aria-hidden="true"
          data-testid={`worksheet-sheet-tab-spinner-${sheet.id}`}
        />
      ) : null}
    </button>
  );

  if (readOnly) return tabButton;

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) onActivate();
      }}
    >
      <ContextMenuTrigger asChild>{tabButton}</ContextMenuTrigger>
      <ContextMenuContent
        data-testid={`worksheet-sheet-menu-${sheet.id}`}
        onCloseAutoFocus={(event) => {
          if (!pendingRename.current) return;
          pendingRename.current = false;
          event.preventDefault();
          onBeginRename();
        }}
      >
        <ContextMenuItem
          data-testid={`worksheet-sheet-menu-rename-${sheet.id}`}
          onSelect={() => {
            pendingRename.current = true;
          }}
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          data-testid={`worksheet-sheet-menu-delete-${sheet.id}`}
          variant="destructive"
          disabled={!canDelete}
          onSelect={onDelete}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
