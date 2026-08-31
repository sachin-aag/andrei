"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldInfoIcon } from "@/components/statistical-analysis/field-info";
import { suggestCategoryColumn } from "@/lib/statistical-analysis/boxplot";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import { boxplotFallbackTitle, MAX_BOXPLOT_CATEGORIES } from "@/lib/statistical-analysis/types";
import {
  dataSheets,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

export type BoxplotDialogValues = {
  yColumnId: string;
  categoryColumnIds: string[];
  title: string;
  rowStart: number | null;
  rowEnd: number | null;
  xAxisLabel: string | null;
  yAxisLabel: string | null;
};

function parseOptionalRow(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

function categorySlotLabel(index: number, total: number): string {
  if (total <= 1) return "Category (innermost)";
  if (index === 0) return `Category ${index + 1} (innermost)`;
  if (index === total - 1) return `Category ${index + 1} (outermost)`;
  return `Category ${index + 1}`;
}

export function BoxplotDialog({
  open,
  worksheet,
  defaultYColumnId,
  defaultCategoryColumnIds,
  defaultRowStart = null,
  defaultRowEnd = null,
  defaultTitle = "",
  defaultXAxisLabel = "",
  defaultYAxisLabel = "",
  editMode = false,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  worksheet: WorksheetData;
  defaultYColumnId: string;
  defaultCategoryColumnIds?: string[];
  defaultRowStart?: number | null;
  defaultRowEnd?: number | null;
  defaultTitle?: string;
  defaultXAxisLabel?: string | null;
  defaultYAxisLabel?: string | null;
  editMode?: boolean;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: BoxplotDialogValues) => void;
}) {
  const sheets = dataSheets(worksheet);
  const fallbackY = defaultYColumnId || worksheet.columns[0]?.id || "";
  const [yColumnId, setYColumnId] = useState(fallbackY);
  const [categoryColumnIds, setCategoryColumnIds] = useState<string[]>(
    () => defaultCategoryColumnIds ?? []
  );
  const [title, setTitle] = useState(defaultTitle);
  const [rowStart, setRowStart] = useState(
    defaultRowStart != null ? String(defaultRowStart) : ""
  );
  const [rowEnd, setRowEnd] = useState(
    defaultRowEnd != null ? String(defaultRowEnd) : ""
  );
  const [xAxisLabel, setXAxisLabel] = useState(defaultXAxisLabel ?? "");
  const [yAxisLabel, setYAxisLabel] = useState(defaultYAxisLabel ?? "");

  const yColumn = findColumn(worksheet, yColumnId) ?? worksheet.columns[0];
  const categoryColumns = categoryColumnIds
    .map((id) => findColumn(worksheet, id))
    .filter((column): column is NonNullable<typeof column> => column != null);
  const rowSelection = normalizeRowSelection({
    rowStart: parseOptionalRow(rowStart),
    rowEnd: parseOptionalRow(rowEnd),
  });
  const rowLabel = formatRowSelection(rowSelection);
  const placeholderTitle = yColumn
    ? boxplotFallbackTitle(
        yColumn.name,
        categoryColumns.map((column) => column.name),
        rowLabel
      )
    : "Boxplot title";
  const usedIds = new Set([yColumnId, ...categoryColumnIds]);
  const canAddCategory =
    categoryColumnIds.length < MAX_BOXPLOT_CATEGORIES &&
    Boolean(suggestCategoryColumn(worksheet, yColumnId, categoryColumnIds));
  const canSubmit =
    Boolean(yColumnId) &&
    categoryColumnIds.every((id) => id && id !== yColumnId) &&
    new Set(categoryColumnIds).size === categoryColumnIds.length;
  const xAxisPlaceholder =
    categoryColumns.length > 0
      ? categoryColumns[categoryColumns.length - 1]?.name ?? "Category"
      : "Category";

  const addCategory = () => {
    const next = suggestCategoryColumn(worksheet, yColumnId, categoryColumnIds);
    if (!next) return;
    setCategoryColumnIds((current) => [...current, next]);
  };

  const columnLabel = (columnId: string, name: string, sheetName: string) =>
    sheets.length > 1 ? `${sheetName}: ${name}` : name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="boxplot-dialog" className="max-h-[min(92vh,44rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Boxplot</DialogTitle>
          <DialogDescription>
            Tukey box-and-whisker of a numeric Y.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="boxplot-y" className={fieldLabelClass}>
              Y
            </Label>
            <Select
              value={yColumnId}
              onValueChange={(value) => {
                setYColumnId(value);
                setCategoryColumnIds((current) =>
                  current.filter((id) => id !== value)
                );
              }}
            >
              <SelectTrigger id="boxplot-y" data-testid="boxplot-y">
                <SelectValue placeholder="Select Y" />
              </SelectTrigger>
              <SelectContent>
                {sheets.flatMap((sheet) =>
                  sheet.columns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {columnLabel(column.id, column.name, sheet.name)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Label className={fieldLabelClass}>Categories</Label>
                <FieldInfoIcon
                  label="Categories"
                  testId="boxplot-categories-info"
                  text="First category is closest to the boxes; last is the outermost label. Only observed combinations. Empty cells are (blank). No categories draws one box of all Y."
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                data-testid="boxplot-add-category"
                disabled={!canAddCategory}
                onClick={addCategory}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add category
              </Button>
            </div>
            {categoryColumnIds.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                One box of all Y.
              </p>
            ) : (
              categoryColumnIds.map((id, index) => (
                <div key={`${id}-${index}`} className="grid gap-1.5">
                  <Label
                    htmlFor={`boxplot-category-${index}`}
                    className={fieldLabelClass}
                  >
                    {categorySlotLabel(index, categoryColumnIds.length)}
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={id}
                      onValueChange={(value) => {
                        setCategoryColumnIds((current) =>
                          current.map((item, i) => (i === index ? value : item))
                        );
                      }}
                    >
                      <SelectTrigger
                        id={`boxplot-category-${index}`}
                        data-testid={`boxplot-category-${index}`}
                      >
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {sheets.flatMap((sheet) =>
                          sheet.columns
                            .filter(
                              (column) =>
                                column.id === id || !usedIds.has(column.id)
                            )
                            .map((column) => (
                              <SelectItem key={column.id} value={column.id}>
                                {columnLabel(column.id, column.name, sheet.name)}
                              </SelectItem>
                            ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      data-testid={`boxplot-remove-category-${index}`}
                      aria-label={`Remove category ${index + 1}`}
                      onClick={() =>
                        setCategoryColumnIds((current) =>
                          current.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="boxplot-row-start" className={fieldLabelClass}>
                  First row
                </Label>
                <FieldInfoIcon
                  label="Row range"
                  testId="boxplot-row-range-info"
                  text="Rows are numbered from 1. Leave both blank to use every filled Y cell."
                />
              </div>
              <Input
                id="boxplot-row-start"
                data-testid="boxplot-row-start"
                inputMode="numeric"
                placeholder="All"
                value={rowStart}
                onChange={(event) => setRowStart(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="boxplot-row-end" className={fieldLabelClass}>
                Last row
              </Label>
              <Input
                id="boxplot-row-end"
                data-testid="boxplot-row-end"
                inputMode="numeric"
                placeholder="All"
                value={rowEnd}
                onChange={(event) => setRowEnd(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="boxplot-title" className={fieldLabelClass}>
              Title (optional)
            </Label>
            <Input
              id="boxplot-title"
              value={title}
              placeholder={placeholderTitle}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <details
            data-testid="boxplot-advanced"
            className="group rounded-md border border-[var(--border)]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium text-[var(--foreground)] marker:content-none [&::-webkit-details-marker]:hidden">
              Advanced
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 border-t border-[var(--border)] px-3 py-3">
              <div className="grid gap-1.5">
                <Label htmlFor="boxplot-x-label" className={fieldLabelClass}>
                  X axis title
                </Label>
                <Input
                  id="boxplot-x-label"
                  data-testid="boxplot-x-label"
                  placeholder={xAxisPlaceholder}
                  value={xAxisLabel}
                  onChange={(event) => setXAxisLabel(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="boxplot-y-label" className={fieldLabelClass}>
                  Y axis title
                </Label>
                <Input
                  id="boxplot-y-label"
                  data-testid="boxplot-y-label"
                  placeholder={yColumn?.name ?? "Y"}
                  value={yAxisLabel}
                  onChange={(event) => setYAxisLabel(event.target.value)}
                />
              </div>
            </div>
          </details>

          {error ? (
            <p className="text-sm text-[var(--destructive)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="boxplot-ok"
            disabled={submitting || !canSubmit}
            onClick={() =>
              onSubmit({
                yColumnId,
                categoryColumnIds,
                title: title.trim(),
                rowStart: parseOptionalRow(rowStart),
                rowEnd: parseOptionalRow(rowEnd),
                xAxisLabel: xAxisLabel.trim() || null,
                yAxisLabel: yAxisLabel.trim() || null,
              })
            }
          >
            {submitting ? (editMode ? "Updating…" : "Running…") : editMode ? "Update" : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
