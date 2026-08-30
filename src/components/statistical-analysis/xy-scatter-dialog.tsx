"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import {
  OBSERVATION_X_LABEL,
  xyScatterFallbackTitle,
} from "@/lib/statistical-analysis/types";
import {
  CHART_MARKS,
  CHART_MARK_LABELS,
  parseChartMark,
  type ChartMark,
} from "@/lib/charts/chart-marks";
import {
  dataSheets,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

/** Radix Select cannot use an empty string; maps to a null X column (1D). */
const OBSERVATION_X_VALUE = "__observation__";
const NONE_LEGEND_VALUE = "__none__";

export type XyScatterDialogValues = {
  xColumnId: string | null;
  yColumnId: string;
  legendColumnId: string | null;
  mark: ChartMark;
  showSpecLimits: boolean;
  title: string;
  rowStart: number | null;
  rowEnd: number | null;
};

function parseOptionalRow(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function toSelectX(xColumnId: string | null | undefined): string {
  return xColumnId ? xColumnId : OBSERVATION_X_VALUE;
}

function fromSelectX(value: string): string | null {
  return value === OBSERVATION_X_VALUE ? null : value;
}

function toSelectLegend(legendColumnId: string | null | undefined): string {
  return legendColumnId ? legendColumnId : NONE_LEGEND_VALUE;
}

function fromSelectLegend(value: string): string | null {
  return value === NONE_LEGEND_VALUE ? null : value;
}

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

export function XyScatterDialog({
  open,
  worksheet,
  defaultYColumnId,
  defaultXColumnId,
  defaultLegendColumnId,
  defaultMark = "scatter",
  defaultShowSpecLimits = false,
  defaultRowStart = null,
  defaultRowEnd = null,
  defaultTitle = "",
  editMode = false,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  worksheet: WorksheetData;
  defaultYColumnId: string;
  defaultXColumnId?: string | null;
  defaultLegendColumnId?: string | null;
  defaultMark?: ChartMark;
  defaultShowSpecLimits?: boolean;
  defaultRowStart?: number | null;
  defaultRowEnd?: number | null;
  defaultTitle?: string;
  editMode?: boolean;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: XyScatterDialogValues) => void;
}) {
  const sheets = dataSheets(worksheet);
  const fallbackY = defaultYColumnId || worksheet.columns[0]?.id || "";
  const [yColumnId, setYColumnId] = useState(fallbackY);
  const [xColumnId, setXColumnId] = useState<string | null>(
    () => defaultXColumnId ?? null
  );
  const [legendColumnId, setLegendColumnId] = useState<string | null>(
    () => defaultLegendColumnId ?? null
  );
  const [mark, setMark] = useState<ChartMark>(() => parseChartMark(defaultMark));
  const [showSpecLimits, setShowSpecLimits] = useState(defaultShowSpecLimits);
  const [title, setTitle] = useState(defaultTitle);
  const [rowStart, setRowStart] = useState(
    defaultRowStart != null ? String(defaultRowStart) : ""
  );
  const [rowEnd, setRowEnd] = useState(
    defaultRowEnd != null ? String(defaultRowEnd) : ""
  );

  const yColumn = findColumn(worksheet, yColumnId) ?? worksheet.columns[0];
  const xColumn = xColumnId ? findColumn(worksheet, xColumnId) : null;
  const legendColumn = legendColumnId
    ? findColumn(worksheet, legendColumnId)
    : null;
  const rowSelection = normalizeRowSelection({
    rowStart: parseOptionalRow(rowStart),
    rowEnd: parseOptionalRow(rowEnd),
  });
  const rowLabel = formatRowSelection(rowSelection);
  const placeholderTitle = yColumn
    ? xyScatterFallbackTitle(
        yColumn.name,
        xColumn?.name ?? null,
        rowLabel,
        legendColumn?.name ?? null
      )
    : "Analysis title";
  const canSubmit =
    Boolean(yColumnId) &&
    (xColumnId == null || yColumnId !== xColumnId) &&
    (legendColumnId == null ||
      (legendColumnId !== yColumnId && legendColumnId !== xColumnId));
  const indexMode = xColumnId == null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="xy-scatter-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Plot measurements</DialogTitle>
          <DialogDescription>
            Y is required. Leave X as Observation for values versus index
            (1, 2, 3…), or pick a numeric X. Chart type is the line you see —
            scatter, line, area, or column. A legend colors dots, lines, or
            stacked columns. A serial or factor column cannot be X — use Legend
            to group by that column.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="xy-y" className={fieldLabelClass}>
              Y (values)
            </Label>
            <Select
              value={yColumnId}
              onValueChange={(value) => {
                setYColumnId(value);
                if (value === xColumnId) {
                  setXColumnId(null);
                }
                if (value === legendColumnId) {
                  setLegendColumnId(null);
                }
              }}
            >
              <SelectTrigger id="xy-y" data-testid="xy-y">
                <SelectValue placeholder="Select Y" />
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
            <div className="flex items-center gap-2 pt-0.5">
              <Checkbox
                id="xy-show-spec-limits"
                data-testid="xy-show-spec-limits"
                checked={showSpecLimits}
                onCheckedChange={(next) => setShowSpecLimits(next === true)}
              />
              <Label
                htmlFor="xy-show-spec-limits"
                className={`${fieldLabelClass} cursor-pointer font-normal`}
              >
                Show LSL, USL values
              </Label>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="xy-x" className={fieldLabelClass}>
              X (optional)
            </Label>
            <Select
              value={toSelectX(xColumnId)}
              onValueChange={(value) => {
                const next = fromSelectX(value);
                setXColumnId(next);
                if (next && next === legendColumnId) {
                  setLegendColumnId(null);
                }
              }}
            >
              <SelectTrigger id="xy-x" data-testid="xy-x">
                <SelectValue placeholder={OBSERVATION_X_LABEL} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OBSERVATION_X_VALUE}>
                  {OBSERVATION_X_LABEL} (1, 2, 3…)
                </SelectItem>
                {sheets.flatMap((sheet) =>
                  sheet.columns
                    .filter((column) => column.id !== yColumnId)
                    .map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {sheets.length > 1
                          ? `${sheet.name}: ${column.name}`
                          : column.name}
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="xy-legend" className={fieldLabelClass}>
              Legend (optional)
            </Label>
            <Select
              value={toSelectLegend(legendColumnId)}
              onValueChange={(value) => setLegendColumnId(fromSelectLegend(value))}
            >
              <SelectTrigger id="xy-legend" data-testid="xy-legend">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_LEGEND_VALUE}>None</SelectItem>
                {sheets.flatMap((sheet) =>
                  sheet.columns
                    .filter(
                      (column) =>
                        column.id !== yColumnId && column.id !== xColumnId
                    )
                    .map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {sheets.length > 1
                          ? `${sheet.name}: ${column.name}`
                          : column.name}
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="xy-mark" className={fieldLabelClass}>
              Chart type
            </Label>
            <Select
              value={mark}
              onValueChange={(value) => setMark(parseChartMark(value))}
            >
              <SelectTrigger id="xy-mark" data-testid="xy-mark">
                <SelectValue placeholder="Scatter" />
              </SelectTrigger>
              <SelectContent>
                {CHART_MARKS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {CHART_MARK_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {legendColumnId || mark === "column" ? (
              <p className="-mb-1 text-xs text-[var(--muted-foreground)]">
                {legendColumnId
                  ? mark === "column"
                    ? "Legend stacks a column for each group at the same X."
                    : mark === "scatter"
                      ? "Legend uses a different color for each group’s dots."
                      : "Legend uses a different color for each group’s line."
                  : "One column per X. Add a legend to stack groups."}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="xy-row-start" className={fieldLabelClass}>
                First row
              </Label>
              <Input
                id="xy-row-start"
                data-testid="xy-row-start"
                inputMode="numeric"
                placeholder="All"
                value={rowStart}
                onChange={(event) => setRowStart(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="xy-row-end" className={fieldLabelClass}>
                Last row
              </Label>
              <Input
                id="xy-row-end"
                data-testid="xy-row-end"
                inputMode="numeric"
                placeholder="All"
                value={rowEnd}
                onChange={(event) => setRowEnd(event.target.value)}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-[var(--muted-foreground)]">
            Worksheet rows are numbered from 1. Leave both blank to use every
            filled {indexMode ? "Y cell" : "pair of cells"}.
          </p>

          <div className="grid gap-1.5">
            <Label htmlFor="xy-title" className={fieldLabelClass}>
              Title (optional)
            </Label>
            <Input
              id="xy-title"
              value={title}
              placeholder={placeholderTitle}
              onChange={(event) => setTitle(event.target.value)}
            />
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
            data-testid="xy-scatter-ok"
            disabled={submitting || !canSubmit}
            onClick={() =>
              onSubmit({
                xColumnId,
                yColumnId,
                legendColumnId,
                mark,
                showSpecLimits,
                title: title.trim(),
                rowStart: parseOptionalRow(rowStart),
                rowEnd: parseOptionalRow(rowEnd),
              })
            }
          >
            {submitting
              ? editMode
                ? "Updating…"
                : "Plotting…"
              : editMode
                ? "Update"
                : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
