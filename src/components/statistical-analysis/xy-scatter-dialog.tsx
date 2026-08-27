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
import { suggestXColumn } from "@/lib/statistical-analysis/xy-scatter";
import {
  dataSheets,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

export type XyScatterDialogValues = {
  xColumnId: string;
  yColumnId: string;
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

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

export function XyScatterDialog({
  open,
  worksheet,
  defaultYColumnId,
  defaultRowStart = null,
  defaultRowEnd = null,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  worksheet: WorksheetData;
  defaultYColumnId: string;
  defaultRowStart?: number | null;
  defaultRowEnd?: number | null;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: XyScatterDialogValues) => void;
}) {
  const sheets = dataSheets(worksheet);
  const fallbackY = defaultYColumnId || worksheet.columns[0]?.id || "";
  const [yColumnId, setYColumnId] = useState(fallbackY);
  const [xColumnId, setXColumnId] = useState(
    () => suggestXColumn(worksheet, fallbackY) ?? ""
  );
  const [title, setTitle] = useState("");
  const [rowStart, setRowStart] = useState(
    defaultRowStart != null ? String(defaultRowStart) : ""
  );
  const [rowEnd, setRowEnd] = useState(
    defaultRowEnd != null ? String(defaultRowEnd) : ""
  );

  const yColumn = findColumn(worksheet, yColumnId) ?? worksheet.columns[0];
  const xColumn = findColumn(worksheet, xColumnId);
  const rowSelection = normalizeRowSelection({
    rowStart: parseOptionalRow(rowStart),
    rowEnd: parseOptionalRow(rowEnd),
  });
  const rowLabel = formatRowSelection(rowSelection);
  const placeholderTitle =
    yColumn && xColumn
      ? rowLabel
        ? `${yColumn.name} vs ${xColumn.name} (${rowLabel})`
        : `${yColumn.name} vs ${xColumn.name}`
      : "Analysis title";
  const canSubmit =
    Boolean(yColumnId) && Boolean(xColumnId) && yColumnId !== xColumnId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="xy-scatter-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scatter</DialogTitle>
          <DialogDescription>
            Plot two numeric worksheet columns. Y is the output (vertical). X
            is the other variable (horizontal). Both must be numbers — a
            serial-number or factor column cannot be X. One series, one
            color; this is not a grouped overlay. Pairs skip rows where
            either cell is not a number.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="xy-y" className={fieldLabelClass}>
              Y (output)
            </Label>
            <Select
              value={yColumnId}
              onValueChange={(value) => {
                setYColumnId(value);
                if (value === xColumnId) {
                  setXColumnId(suggestXColumn(worksheet, value) ?? "");
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
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="xy-x" className={fieldLabelClass}>
              X
            </Label>
            <Select value={xColumnId} onValueChange={setXColumnId}>
              <SelectTrigger id="xy-x" data-testid="xy-x">
                <SelectValue placeholder="Select X" />
              </SelectTrigger>
              <SelectContent>
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
            filled pair of cells.
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
            disabled={submitting || !canSubmit}
            onClick={() =>
              onSubmit({
                xColumnId,
                yColumnId,
                title: title.trim(),
                rowStart: parseOptionalRow(rowStart),
                rowEnd: parseOptionalRow(rowEnd),
              })
            }
          >
            {submitting ? "Plotting…" : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
