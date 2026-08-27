"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MIN_VISIBLE_ROWS } from "@/lib/statistical-analysis/types";
import {
  clampSelection,
  collapseSelection,
  isCellInSelection,
  moveSelection,
  selectionBounds,
  type GridSelection,
} from "@/lib/statistical-analysis/grid-selection";
import {
  pasteTsv,
  renameColumn,
  rowCount,
  setCell,
} from "@/lib/statistical-analysis/worksheet";
import type { WorksheetColumn, WorksheetData } from "@/lib/statistical-analysis/types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type ColumnMenuAction =
  | "insert-left"
  | "insert-right"
  | "delete"
  | "clear"
  | "specs"
  | "analyze";

export type { GridSelection };

type WorksheetGridProps = {
  worksheet: WorksheetData;
  selection: GridSelection;
  onSelectionChange: (selection: GridSelection) => void;
  onChange: (worksheet: WorksheetData) => void;
  readOnly?: boolean;
  onColumnMenuAction?: (action: ColumnMenuAction, colIndex: number) => void;
};

const EXTRA_EMPTY_ROWS = 8;

function visibleRowCount(data: WorksheetData): number {
  return Math.max(MIN_VISIBLE_ROWS, rowCount(data) + EXTRA_EMPTY_ROWS);
}

function tsvFromSelection(worksheet: WorksheetData, selection: GridSelection): string {
  const bounds = selectionBounds(selection);
  const lines: string[] = [];
  for (let row = bounds.rowStart; row <= bounds.rowEnd; row++) {
    const cells: string[] = [];
    for (let col = bounds.colStart; col <= bounds.colEnd; col++) {
      cells.push(worksheet.columns[col]?.values[row] ?? "");
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

function clearSelectionCells(
  worksheet: WorksheetData,
  selection: GridSelection
): WorksheetData {
  let next = worksheet;
  const bounds = selectionBounds(selection);
  for (let row = bounds.rowStart; row <= bounds.rowEnd; row++) {
    for (let col = bounds.colStart; col <= bounds.colEnd; col++) {
      next = setCell(next, col, row, "");
    }
  }
  return next;
}

function isPrintableKey(event: React.KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function WorksheetColumnHeader({
  column,
  selected,
  editing,
  headerDraft,
  headerInputRef,
  readOnly,
  onSelect,
  onBeginRename,
  onHeaderDraftChange,
  onCommitHeader,
  onCancelHeader,
  onMenuAction,
}: {
  column: WorksheetColumn;
  selected: boolean;
  editing: boolean;
  headerDraft: string;
  headerInputRef: React.RefObject<HTMLInputElement | null>;
  readOnly: boolean;
  onSelect: () => void;
  onBeginRename: () => void;
  onHeaderDraftChange: (value: string) => void;
  onCommitHeader: () => void;
  onCancelHeader: () => void;
  onMenuAction?: (action: ColumnMenuAction) => void;
}) {
  const headerClass = cn(
    "min-w-[6.5rem] border border-[var(--border)] bg-[var(--secondary)] px-1 py-1 font-medium",
    selected && "bg-[var(--brand-100)]"
  );

  const headerBody = editing ? (
    <input
      ref={headerInputRef}
      value={headerDraft}
      aria-label="Column name"
      className="h-6 w-full rounded-sm border border-[var(--ring)] bg-[var(--input)] px-1 text-xs font-medium"
      onChange={(event) => onHeaderDraftChange(event.target.value)}
      onBlur={onCommitHeader}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommitHeader();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancelHeader();
        }
      }}
    />
  ) : (
    <button
      type="button"
      data-testid={`column-header-${column.id}`}
      className="w-full truncate px-1 text-left font-medium"
      onClick={onSelect}
      onDoubleClick={() => {
        if (readOnly) return;
        onBeginRename();
      }}
    >
      {column.name}
    </button>
  );

  if (editing || !onMenuAction) {
    return (
      <th scope="col" className={headerClass}>
        {headerBody}
      </th>
    );
  }

  return (
    <th scope="col" className={headerClass}>
      <ContextMenu
        onOpenChange={(open) => {
          if (open) onSelect();
        }}
      >
        <ContextMenuTrigger asChild>
          <div>{headerBody}</div>
        </ContextMenuTrigger>
        <ContextMenuContent data-testid={`column-menu-${column.id}`}>
          {readOnly ? null : (
            <>
              <ContextMenuItem
                data-testid={`column-insert-left-${column.id}`}
                onSelect={() => onMenuAction("insert-left")}
              >
                Insert column left
              </ContextMenuItem>
              <ContextMenuItem
                data-testid={`column-insert-right-${column.id}`}
                onSelect={() => onMenuAction("insert-right")}
              >
                Insert column right
              </ContextMenuItem>
              <ContextMenuItem
                data-testid={`column-delete-${column.id}`}
                variant="destructive"
                onSelect={() => onMenuAction("delete")}
              >
                Delete column
              </ContextMenuItem>
              <ContextMenuItem
                data-testid={`column-clear-${column.id}`}
                onSelect={() => onMenuAction("clear")}
              >
                Clear data
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem
            data-testid={`column-specs-${column.id}`}
            onSelect={() => onMenuAction("specs")}
          >
            {readOnly ? "View specs…" : "Specs…"}
          </ContextMenuItem>
          {readOnly ? null : (
            <ContextMenuItem
              data-testid={`column-analyze-${column.id}`}
              onSelect={() => onMenuAction("analyze")}
            >
              Analyze data…
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </th>
  );
}

export function WorksheetGrid({
  worksheet,
  selection,
  onSelectionChange,
  onChange,
  readOnly = false,
  onColumnMenuAction,
}: WorksheetGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [headerDraft, setHeaderDraft] = useState("");

  const columns = worksheet.columns;
  const rows = visibleRowCount(worksheet);
  const bounds = selectionBounds(selection);
  const maxCol = Math.max(0, columns.length - 1);
  const maxRow = Math.max(0, rows - 1);

  const cellValue = (col: number, row: number): string =>
    columns[col]?.values[row] ?? "";

  const select = (next: GridSelection) => {
    onSelectionChange(clampSelection(next, maxCol, maxRow));
  };

  const beginEdit = (initial: string) => {
    if (readOnly) return;
    setDraft(initial);
    setEditing(true);
  };

  const commitEdit = (move?: { col: number; row: number }) => {
    if (editing) {
      onChange(setCell(worksheet, selection.col, selection.row, draft));
      setEditing(false);
    }
    if (move) select(collapseSelection(move.col, move.row));
    gridRef.current?.focus();
  };

  const cancelEdit = () => {
    setEditing(false);
    gridRef.current?.focus();
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing, selection.col, selection.row]);

  useEffect(() => {
    if (editingHeader !== null) headerInputRef.current?.focus();
  }, [editingHeader]);

  const commitHeader = () => {
    if (editingHeader === null) return;
    onChange(renameColumn(worksheet, editingHeader, headerDraft));
    setEditingHeader(null);
    gridRef.current?.focus();
  };

  const handleGridKeyDown = (event: React.KeyboardEvent) => {
    if (editingHeader !== null) return;
    if (editing) return;

    if (event.key === "F2") {
      event.preventDefault();
      beginEdit(cellValue(selection.col, selection.row));
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (readOnly) return;
      event.preventDefault();
      onChange(clearSelectionCells(worksheet, selection));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      select(moveSelection(selection, 0, 1, false, maxCol, maxRow));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      select(
        moveSelection(
          selection,
          event.shiftKey ? -1 : 1,
          0,
          false,
          maxCol,
          maxRow
        )
      );
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      select(
        moveSelection(selection, -1, 0, event.shiftKey, maxCol, maxRow)
      );
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      select(moveSelection(selection, 1, 0, event.shiftKey, maxCol, maxRow));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      select(
        moveSelection(selection, 0, -1, event.shiftKey, maxCol, maxRow)
      );
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      select(moveSelection(selection, 0, 1, event.shiftKey, maxCol, maxRow));
      return;
    }
    if (isPrintableKey(event)) {
      if (readOnly) return;
      event.preventDefault();
      beginEdit(event.key);
    }
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit({ col: selection.col, row: selection.row + 1 });
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      commitEdit({
        col: selection.col + (event.shiftKey ? -1 : 1),
        row: selection.row,
      });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  };

  const handleCopy = (event: React.ClipboardEvent) => {
    if (editing) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", tsvFromSelection(worksheet, selection));
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    if (editing || readOnly) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    onChange(pasteTsv(worksheet, bounds.colStart, bounds.rowStart, text));
  };

  return (
    <div
      ref={gridRef}
      role="grid"
      tabIndex={0}
      data-testid="worksheet-grid"
      data-col-start={bounds.colStart}
      data-col-end={bounds.colEnd}
      data-row-start={bounds.rowStart}
      data-row-end={bounds.rowEnd}
      aria-label="Worksheet"
      aria-multiselectable="true"
      aria-rowcount={rows + 1}
      aria-colcount={columns.length + 1}
      className="h-full overflow-auto bg-[var(--card)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      onKeyDown={handleGridKeyDown}
      onCopy={handleCopy}
      onPaste={handlePaste}
    >
      <table className="min-w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20">
          <tr>
            <th
              className="sticky left-0 z-30 w-10 min-w-10 border border-[var(--border)] bg-[var(--secondary)] font-medium text-[var(--muted-foreground)]"
              scope="col"
            />
            {columns.map((column, colIndex) => (
              <WorksheetColumnHeader
                key={column.id}
                column={column}
                selected={
                  colIndex >= bounds.colStart && colIndex <= bounds.colEnd
                }
                editing={editingHeader === colIndex}
                headerDraft={headerDraft}
                headerInputRef={headerInputRef}
                readOnly={readOnly}
                onSelect={() =>
                  select(collapseSelection(colIndex, selection.row))
                }
                onBeginRename={() => {
                  if (readOnly) return;
                  setEditingHeader(colIndex);
                  setHeaderDraft(column.name);
                }}
                onHeaderDraftChange={setHeaderDraft}
                onCommitHeader={commitHeader}
                onCancelHeader={() => {
                  setEditingHeader(null);
                  gridRef.current?.focus();
                }}
                onMenuAction={
                  onColumnMenuAction
                    ? (action) => onColumnMenuAction(action, colIndex)
                    : undefined
                }
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr
              key={rowIndex}
              className="stat-grid-row"
              style={{ contentVisibility: "auto", containIntrinsicSize: "0 28px" }}
            >
              <th
                scope="row"
                data-testid={`row-header-${rowIndex}`}
                className={cn(
                  "sticky left-0 z-10 w-10 min-w-10 cursor-pointer border border-[var(--border)] bg-[var(--secondary)] text-center font-medium tabular-nums text-[var(--muted-foreground)]",
                  rowIndex >= bounds.rowStart &&
                    rowIndex <= bounds.rowEnd &&
                    "bg-[var(--brand-100)]"
                )}
                onClick={(event) => {
                  if (event.shiftKey) {
                    select({
                      ...selection,
                      row: rowIndex,
                    });
                    gridRef.current?.focus();
                    return;
                  }
                  select(collapseSelection(selection.col, rowIndex));
                  gridRef.current?.focus();
                }}
              >
                {rowIndex + 1}
              </th>
              {columns.map((column, colIndex) => {
                const inSelection = isCellInSelection(
                  selection,
                  colIndex,
                  rowIndex
                );
                const focused =
                  selection.col === colIndex && selection.row === rowIndex;
                const isEditing = focused && editing;
                return (
                  <td
                    key={column.id}
                    role="gridcell"
                    aria-selected={inSelection}
                    data-testid={`cell-${column.id}-${rowIndex}`}
                    data-in-selection={inSelection ? "true" : undefined}
                    className={cn(
                      "h-7 min-w-[6.5rem] border border-[var(--border)] bg-[var(--card)] px-1 tabular-nums",
                      inSelection && "bg-[var(--brand-50)]",
                      focused && "ring-1 ring-inset ring-[var(--ring)]"
                    )}
                    onClick={(event) => {
                      if (editing && !focused) commitEdit();
                      if (event.shiftKey) {
                        select({
                          ...selection,
                          col: colIndex,
                          row: rowIndex,
                        });
                      } else {
                        select(collapseSelection(colIndex, rowIndex));
                      }
                      gridRef.current?.focus();
                    }}
                    onDoubleClick={() => {
                      if (readOnly) return;
                      select(collapseSelection(colIndex, rowIndex));
                      beginEdit(cellValue(colIndex, rowIndex));
                    }}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        value={draft}
                        aria-label={`${column.name} row ${rowIndex + 1}`}
                        className="h-full w-full bg-transparent px-0.5 text-xs tabular-nums outline-none"
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => commitEdit()}
                        onKeyDown={handleEditorKeyDown}
                      />
                    ) : (
                      <span className="block truncate px-0.5">
                        {cellValue(colIndex, rowIndex)}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
