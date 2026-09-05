"use client";

import { useState } from "react";
import { usePlotTitle } from "@/components/statistical-analysis/use-plot-title";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { histogramFallbackTitle } from "@/lib/statistical-analysis/types";
import { histogramLimitsFromColumnSpecs } from "@/lib/statistical-analysis/histogram";
import {
  columnNumericValues,
  dataSheets,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

export type HistogramDialogValues = {
  columnId: string;
  title: string;
  lsl: number | null;
  usl: number | null;
  showDistributionLines: boolean;
  showLsl: boolean;
  showUsl: boolean;
  rowStart: number | null;
  rowEnd: number | null;
};

function parseOptionalNumber(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseOptionalRow(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function formatLimitInput(value: number | null): string {
  if (value == null) return "";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

function limitsForColumn(
  worksheet: WorksheetData,
  columnId: string
): { lsl: string; usl: string } {
  const selectedColumn = findColumn(worksheet, columnId) ?? worksheet.columns[0];
  if (!selectedColumn) return { lsl: "", usl: "" };
  const limits = histogramLimitsFromColumnSpecs(
    worksheet,
    selectedColumn.name
  );
  return {
    lsl: formatLimitInput(limits.lsl),
    usl: formatLimitInput(limits.usl),
  };
}

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

export function HistogramDialog({
  open,
  worksheet,
  defaultColumnId,
  defaultRowStart = null,
  defaultRowEnd = null,
  defaultTitle = "",
  defaultLsl = null,
  defaultUsl = null,
  defaultShowDistributionLines = true,
  defaultShowLsl = true,
  defaultShowUsl = true,
  editMode = false,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  worksheet: WorksheetData;
  defaultColumnId: string;
  defaultRowStart?: number | null;
  defaultRowEnd?: number | null;
  defaultTitle?: string;
  defaultLsl?: number | null;
  defaultUsl?: number | null;
  defaultShowDistributionLines?: boolean;
  defaultShowLsl?: boolean;
  defaultShowUsl?: boolean;
  editMode?: boolean;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: HistogramDialogValues) => void;
}) {
  const initialLimits = editMode
    ? {
        lsl: formatLimitInput(defaultLsl),
        usl: formatLimitInput(defaultUsl),
      }
    : limitsForColumn(worksheet, defaultColumnId);
  const [columnId, setColumnId] = useState(defaultColumnId);
  const [lsl, setLsl] = useState(initialLimits.lsl);
  const [usl, setUsl] = useState(initialLimits.usl);
  const [showDistributionLines, setShowDistributionLines] = useState(
    defaultShowDistributionLines
  );
  const [showLsl, setShowLsl] = useState(defaultShowLsl);
  const [showUsl, setShowUsl] = useState(defaultShowUsl);
  const [rowStart, setRowStart] = useState(
    defaultRowStart != null ? String(defaultRowStart) : ""
  );
  const [rowEnd, setRowEnd] = useState(
    defaultRowEnd != null ? String(defaultRowEnd) : ""
  );

  const applyColumnLimits = (nextColumnId: string) => {
    const next = limitsForColumn(worksheet, nextColumnId);
    setLsl(next.lsl);
    setUsl(next.usl);
  };

  const selectedColumn = findColumn(worksheet, columnId) ?? worksheet.columns[0];
  const sheets = dataSheets(worksheet);
  const rowSelection = normalizeRowSelection({
    rowStart: parseOptionalRow(rowStart),
    rowEnd: parseOptionalRow(rowEnd),
  });
  const numeric = selectedColumn
    ? columnNumericValues(selectedColumn, rowSelection)
    : { values: [], skipped: 0 };
  const rowLabel = formatRowSelection(rowSelection);
  const suggestedTitle = selectedColumn
    ? histogramFallbackTitle(selectedColumn.name, rowLabel)
    : "Histogram title";
  const { title, setTitle, resolvedTitle } = usePlotTitle(
    suggestedTitle,
    defaultTitle
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="histogram-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Histogram</DialogTitle>
          <DialogDescription>
            Frequency histogram of a numeric column (same chart as the sixpack).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="histogram-column" className={fieldLabelClass}>
              Data column
            </Label>
            <Select
              value={columnId}
              onValueChange={(value) => {
                setColumnId(value);
                applyColumnLimits(value);
              }}
            >
              <SelectTrigger id="histogram-column" data-testid="histogram-column">
                <SelectValue placeholder="Select a column" />
              </SelectTrigger>
              <SelectContent>
                {sheets.flatMap((sheet) =>
                  sheet.columns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {sheets.length > 1
                        ? `${sheet.name}: ${column.name}`
                        : column.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-[var(--muted-foreground)]">
              {numeric.values.length} numeric value
              {numeric.values.length === 1 ? "" : "s"}
              {rowLabel ? ` in ${rowLabel}` : ""}
              {numeric.skipped > 0 ? `, ${numeric.skipped} skipped` : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="histogram-row-start" className={fieldLabelClass}>
                  First row
                </Label>
                <FieldInfoIcon
                  label="Row range"
                  testId="histogram-row-range-info"
                  text="Rows are numbered from 1. Leave both blank to use the whole column."
                />
              </div>
              <Input
                id="histogram-row-start"
                data-testid="histogram-row-start"
                inputMode="numeric"
                placeholder="All"
                value={rowStart}
                onChange={(event) => {
                  setRowStart(event.target.value);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="histogram-row-end" className={fieldLabelClass}>
                Last row
              </Label>
              <Input
                id="histogram-row-end"
                data-testid="histogram-row-end"
                inputMode="numeric"
                placeholder="All"
                value={rowEnd}
                onChange={(event) => {
                  setRowEnd(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="histogram-title" className={fieldLabelClass}>
              Title (optional)
            </Label>
            <Input
              id="histogram-title"
              data-testid="histogram-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="histogram-lsl" className={fieldLabelClass}>
                  LSL
                </Label>
                <FieldInfoIcon
                  label="LSL"
                  testId="histogram-lsl-info"
                  text="Lower spec limit. Optional. Uncheck Show LSL to hide the line."
                />
              </div>
              <Input
                id="histogram-lsl"
                data-testid="histogram-lsl"
                inputMode="decimal"
                value={lsl}
                onChange={(event) => setLsl(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="histogram-usl" className={fieldLabelClass}>
                  USL
                </Label>
                <FieldInfoIcon
                  label="USL"
                  testId="histogram-usl-info"
                  text="Upper spec limit. Optional. Uncheck Show USL to hide the line."
                />
              </div>
              <Input
                id="histogram-usl"
                data-testid="histogram-usl"
                inputMode="decimal"
                value={usl}
                onChange={(event) => setUsl(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="histogram-show-distribution"
                data-testid="histogram-show-distribution"
                checked={showDistributionLines}
                onCheckedChange={(next) =>
                  setShowDistributionLines(next === true)
                }
              />
              <Label
                htmlFor="histogram-show-distribution"
                className={`${fieldLabelClass} cursor-pointer font-normal`}
              >
                Show distribution lines
              </Label>
              <FieldInfoIcon
                label="Distribution lines"
                testId="histogram-distribution-info"
                text="Overall (dashed) and within (solid) normal curves from the sixpack histogram."
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="histogram-show-lsl"
                data-testid="histogram-show-lsl"
                checked={showLsl}
                onCheckedChange={(next) => setShowLsl(next === true)}
              />
              <Label
                htmlFor="histogram-show-lsl"
                className={`${fieldLabelClass} cursor-pointer font-normal`}
              >
                Show LSL
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="histogram-show-usl"
                data-testid="histogram-show-usl"
                checked={showUsl}
                onCheckedChange={(next) => setShowUsl(next === true)}
              />
              <Label
                htmlFor="histogram-show-usl"
                className={`${fieldLabelClass} cursor-pointer font-normal`}
              >
                Show USL
              </Label>
            </div>
          </div>
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
            data-testid="histogram-ok"
            disabled={submitting || !columnId}
            onClick={() =>
              onSubmit({
                columnId,
                title: resolvedTitle,
                lsl: parseOptionalNumber(lsl),
                usl: parseOptionalNumber(usl),
                showDistributionLines,
                showLsl,
                showUsl,
                rowStart: parseOptionalRow(rowStart),
                rowEnd: parseOptionalRow(rowEnd),
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
