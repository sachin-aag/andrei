"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MIN_VISIBLE_ROWS } from "@/lib/statistical-analysis/types";
import {
  pasteTsv,
  renameColumn,
  rowCount,
  setCell,
} from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

export type GridSelection = { col: number; row: number };

type WorksheetGridProps = {
  worksheet: WorksheetData;
  selection: GridSelection;
  onSelectionChange: (selection: GridSelection) => void;
  onChange: (worksheet: WorksheetData) => void;
  readOnly?: boolean;
};

const EXTRA_EMPTY_ROWS = 8;

function visibleRowCount(data: WorksheetData): number {
  return Math.max(MIN_VISIBLE_ROWS, rowCount(data) + EXTRA_EMPTY_ROWS);
}

function isPrintableKey(event: React.KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function WorksheetGrid({
  worksheet,
  selection,
  onSelectionChange,
  onChange,
  readOnly = false,
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

  const cellValue = (col: number, row: number): string =>
    columns[col]?.values[row] ?? "";

  const clampSelection = (next: GridSelection): GridSelection => ({
    col: Math.max(0, Math.min(next.col, columns.length - 1)),
    row: Math.max(0, Math.min(next.row, rows - 1)),
  });

  const select = (next: GridSelection) => {
    onSelectionChange(clampSelection(next));
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
    if (move) select(move);
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
      onChange(setCell(worksheet, selection.col, selection.row, ""));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      select({ col: selection.col, row: selection.row + 1 });
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      select({
        col: selection.col + (event.shiftKey ? -1 : 1),
        row: selection.row,
      });
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      select({ col: selection.col - 1, row: selection.row });
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      select({ col: selection.col + 1, row: selection.row });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      select({ col: selection.col, row: selection.row - 1 });
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      select({ col: selection.col, row: selection.row + 1 });
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
    event.clipboardData.setData("text/plain", cellValue(selection.col, selection.row));
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    if (editing || readOnly) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    onChange(pasteTsv(worksheet, selection.col, selection.row, text));
  };

  return (
    <div
      ref={gridRef}
      role="grid"
      tabIndex={0}
      data-testid="worksheet-grid"
      aria-label="Worksheet"
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
            {columns.map((column, colIndex) => {
              const selected = selection.col === colIndex;
              return (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    "min-w-[6.5rem] border border-[var(--border)] bg-[var(--secondary)] px-1 py-1 font-medium",
                    selected && "bg-[var(--brand-100)]"
                  )}
                >
                  {editingHeader === colIndex ? (
                    <input
                      ref={headerInputRef}
                      value={headerDraft}
                      aria-label="Column name"
                      className="h-6 w-full rounded-sm border border-[var(--ring)] bg-[var(--input)] px-1 text-xs font-medium"
                      onChange={(event) => setHeaderDraft(event.target.value)}
                      onBlur={commitHeader}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitHeader();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setEditingHeader(null);
                          gridRef.current?.focus();
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid={`column-header-${column.id}`}
                      className="w-full truncate px-1 text-left font-medium"
                      onClick={() => select({ col: colIndex, row: selection.row })}
                      onDoubleClick={() => {
                        if (readOnly) return;
                        setEditingHeader(colIndex);
                        setHeaderDraft(column.name);
                      }}
                    >
                      {column.name}
                    </button>
                  )}
                </th>
              );
            })}
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
                className={cn(
                  "sticky left-0 z-10 w-10 min-w-10 border border-[var(--border)] bg-[var(--secondary)] text-center font-medium tabular-nums text-[var(--muted-foreground)]",
                  selection.row === rowIndex && "bg-[var(--brand-100)]"
                )}
              >
                {rowIndex + 1}
              </th>
              {columns.map((column, colIndex) => {
                const selected =
                  selection.col === colIndex && selection.row === rowIndex;
                const isEditing = selected && editing;
                return (
                  <td
                    key={column.id}
                    role="gridcell"
                    aria-selected={selected}
                    data-testid={`cell-${column.id}-${rowIndex}`}
                    className={cn(
                      "h-7 min-w-[6.5rem] border border-[var(--border)] bg-[var(--card)] px-1 tabular-nums",
                      selected && "bg-[var(--brand-50)] ring-1 ring-inset ring-[var(--ring)]"
                    )}
                    onClick={() => {
                      if (editing && !selected) commitEdit();
                      select({ col: colIndex, row: rowIndex });
                      gridRef.current?.focus();
                    }}
                    onDoubleClick={() => {
                      if (readOnly) return;
                      select({ col: colIndex, row: rowIndex });
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
