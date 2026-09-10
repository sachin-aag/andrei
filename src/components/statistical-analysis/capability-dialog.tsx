"use client";

import { useState } from "react";
import { usePlotTitle } from "@/components/statistical-analysis/use-plot-title";
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
import { WARN_VALUES_FOR_SIXPACK } from "@/lib/statistical-analysis/types";
import {
  columnNumericValues,
  dataSheets,
  defaultSixpackLimits,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

export type CapabilityDialogValues = {
  columnId: string;
  title: string;
  lsl: number | null;
  usl: number | null;
  target: number | null;
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
  columnId: string,
  rowStartRaw: string,
  rowEndRaw: string
): { lsl: string; usl: string; target: string } {
  const selectedColumn = findColumn(worksheet, columnId) ?? worksheet.columns[0];
  if (!selectedColumn) return { lsl: "", usl: "", target: "" };
  const numeric = columnNumericValues(
    selectedColumn,
    normalizeRowSelection({
      rowStart: parseOptionalRow(rowStartRaw),
      rowEnd: parseOptionalRow(rowEndRaw),
    })
  );
  const limits = defaultSixpackLimits({
    columnName: selectedColumn.name,
    values: numeric.values,
    worksheet,
  });
  return {
    lsl: formatLimitInput(limits.lsl),
    usl: formatLimitInput(limits.usl),
    target: formatLimitInput(limits.target),
  };
}

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

export function CapabilityDialog({
  open,
  worksheet,
  defaultColumnId,
  defaultRowStart = null,
  defaultRowEnd = null,
  defaultTitle = "",
  defaultLsl = null,
  defaultUsl = null,
  defaultTarget = null,
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
  defaultTarget?: number | null;
  editMode?: boolean;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CapabilityDialogValues) => void;
}) {
  const initialLimits = editMode
    ? {
        lsl: formatLimitInput(defaultLsl),
        usl: formatLimitInput(defaultUsl),
        target: formatLimitInput(defaultTarget),
      }
    : limitsForColumn(
        worksheet,
        defaultColumnId,
        defaultRowStart != null ? String(defaultRowStart) : "",
        defaultRowEnd != null ? String(defaultRowEnd) : ""
      );
  const [columnId, setColumnId] = useState(defaultColumnId);
  const [lsl, setLsl] = useState(initialLimits.lsl);
  const [usl, setUsl] = useState(initialLimits.usl);
  const [target, setTarget] = useState(initialLimits.target);
  const [rowStart, setRowStart] = useState(
    defaultRowStart != null ? String(defaultRowStart) : ""
  );
  const [rowEnd, setRowEnd] = useState(
    defaultRowEnd != null ? String(defaultRowEnd) : ""
  );

  const applyColumnLimits = (
    nextColumnId: string,
    nextRowStart: string,
    nextRowEnd: string
  ) => {
    const next = limitsForColumn(
      worksheet,
      nextColumnId,
      nextRowStart,
      nextRowEnd
    );
    setLsl(next.lsl);
    setUsl(next.usl);
    setTarget(next.target);
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
  const suggestedTitle = rowLabel
    ? `${selectedColumn?.name ?? "Analysis"} (${rowLabel})`
    : (selectedColumn?.name ?? "Analysis title");
  const { title, setTitle, resolvedTitle } = usePlotTitle(
    suggestedTitle,
    defaultTitle
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="capability-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Normal Capability Sixpack</DialogTitle>
          <DialogDescription>
            I-MR capability for a numeric column.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sixpack-column" className={fieldLabelClass}>
              Data column
            </Label>
            <Select
              value={columnId}
              onValueChange={(value) => {
                setColumnId(value);
                applyColumnLimits(value, rowStart, rowEnd);
              }}
            >
              <SelectTrigger id="sixpack-column" data-testid="sixpack-column">
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
            {numeric.values.length > 0 &&
            numeric.values.length < WARN_VALUES_FOR_SIXPACK ? (
              <p className="text-xs text-amber-800">
                Capability estimates are noisy below {WARN_VALUES_FOR_SIXPACK}{" "}
                observations.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="sixpack-row-start" className={fieldLabelClass}>
                  First row
                </Label>
                <FieldInfoIcon
                  label="Row range"
                  testId="sixpack-row-range-info"
                  text="Rows are numbered from 1. Leave both blank to use the whole column."
                />
              </div>
              <Input
                id="sixpack-row-start"
                data-testid="sixpack-row-start"
                inputMode="numeric"
                placeholder="All"
                value={rowStart}
                onChange={(event) => {
                  const value = event.target.value;
                  setRowStart(value);
                  applyColumnLimits(columnId, value, rowEnd);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sixpack-row-end" className={fieldLabelClass}>
                Last row
              </Label>
              <Input
                id="sixpack-row-end"
                data-testid="sixpack-row-end"
                inputMode="numeric"
                placeholder="All"
                value={rowEnd}
                onChange={(event) => {
                  const value = event.target.value;
                  setRowEnd(value);
                  applyColumnLimits(columnId, rowStart, value);
                }}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sixpack-title" className={fieldLabelClass}>
              Title (optional)
            </Label>
            <Input
              id="sixpack-title"
              data-testid="sixpack-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="sixpack-lsl" className={fieldLabelClass}>
                  LSL
                </Label>
                <FieldInfoIcon
                  label="LSL"
                  testId="sixpack-lsl-info"
                  text="Lower spec limit. At least one of LSL or USL is required."
                />
              </div>
              <Input
                id="sixpack-lsl"
                data-testid="sixpack-lsl"
                inputMode="decimal"
                value={lsl}
                onChange={(event) => setLsl(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="sixpack-target" className={fieldLabelClass}>
                  Target
                </Label>
                <FieldInfoIcon
                  label="Target"
                  testId="sixpack-target-info"
                  text="Nominal target; optional."
                />
              </div>
              <Input
                id="sixpack-target"
                data-testid="sixpack-target"
                inputMode="decimal"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="sixpack-usl" className={fieldLabelClass}>
                  USL
                </Label>
                <FieldInfoIcon
                  label="USL"
                  testId="sixpack-usl-info"
                  text="Upper spec limit. At least one of LSL or USL is required."
                />
              </div>
              <Input
                id="sixpack-usl"
                data-testid="sixpack-usl"
                inputMode="decimal"
                value={usl}
                onChange={(event) => setUsl(event.target.value)}
              />
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
            disabled={submitting || !columnId}
            onClick={() =>
              onSubmit({
                columnId,
                title: resolvedTitle,
                lsl: parseOptionalNumber(lsl),
                usl: parseOptionalNumber(usl),
                target: parseOptionalNumber(target),
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
