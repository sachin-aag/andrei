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
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import { suggestFactorColumn } from "@/lib/statistical-analysis/anova";
import {
  dataSheets,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

export type AnovaDialogValues = {
  responseColumnId: string;
  factorColumnId: string;
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

export function AnovaDialog({
  open,
  worksheet,
  defaultResponseColumnId,
  defaultFactorColumnId,
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
  defaultResponseColumnId: string;
  defaultFactorColumnId?: string;
  defaultRowStart?: number | null;
  defaultRowEnd?: number | null;
  defaultTitle?: string;
  editMode?: boolean;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AnovaDialogValues) => void;
}) {
  const sheets = dataSheets(worksheet);
  const fallbackResponse =
    defaultResponseColumnId || worksheet.columns[0]?.id || "";
  const [responseColumnId, setResponseColumnId] = useState(fallbackResponse);
  const [factorColumnId, setFactorColumnId] = useState(
    () =>
      defaultFactorColumnId ??
      suggestFactorColumn(worksheet, fallbackResponse) ??
      ""
  );
  const [rowStart, setRowStart] = useState(
    defaultRowStart != null ? String(defaultRowStart) : ""
  );
  const [rowEnd, setRowEnd] = useState(
    defaultRowEnd != null ? String(defaultRowEnd) : ""
  );

  const responseColumn =
    findColumn(worksheet, responseColumnId) ?? worksheet.columns[0];
  const factorColumn = findColumn(worksheet, factorColumnId);
  const rowSelection = normalizeRowSelection({
    rowStart: parseOptionalRow(rowStart),
    rowEnd: parseOptionalRow(rowEnd),
  });
  const rowLabel = formatRowSelection(rowSelection);
  const suggestedTitle =
    responseColumn && factorColumn
      ? rowLabel
        ? `${responseColumn.name} by ${factorColumn.name} (${rowLabel})`
        : `${responseColumn.name} by ${factorColumn.name}`
      : "Analysis title";
  const { title, setTitle, resolvedTitle } = usePlotTitle(
    suggestedTitle,
    defaultTitle
  );
  const canSubmit =
    Boolean(responseColumnId) &&
    Boolean(factorColumnId) &&
    responseColumnId !== factorColumnId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="anova-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>One-Way ANOVA</DialogTitle>
          <DialogDescription>
            Compare a numeric response across groups.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="anova-response" className={fieldLabelClass}>
              Response
            </Label>
            <Select
              value={responseColumnId}
              onValueChange={(value) => {
                setResponseColumnId(value);
                if (value === factorColumnId) {
                  setFactorColumnId(suggestFactorColumn(worksheet, value) ?? "");
                }
              }}
            >
              <SelectTrigger id="anova-response" data-testid="anova-response">
                <SelectValue placeholder="Select a response" />
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
            <div className="flex items-center gap-1">
              <Label htmlFor="anova-factor" className={fieldLabelClass}>
                Factor
              </Label>
              <FieldInfoIcon
                label="Factor"
                testId="anova-factor-info"
                text="Grouping column on the same sheet. Pairwise tests are Bonferroni t-tests using the ANOVA MSE."
              />
            </div>
            <Select
              value={factorColumnId}
              onValueChange={setFactorColumnId}
            >
              <SelectTrigger id="anova-factor" data-testid="anova-factor">
                <SelectValue placeholder="Select a factor" />
              </SelectTrigger>
              <SelectContent>
                {sheets.flatMap((sheet) =>
                  sheet.columns
                    .filter((column) => column.id !== responseColumnId)
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
              <div className="flex items-center gap-1">
                <Label htmlFor="anova-row-start" className={fieldLabelClass}>
                  First row
                </Label>
                <FieldInfoIcon
                  label="Row range"
                  testId="anova-row-range-info"
                  text="Rows are numbered from 1. Leave both blank to use every filled pair of cells."
                />
              </div>
              <Input
                id="anova-row-start"
                data-testid="anova-row-start"
                inputMode="numeric"
                placeholder="All"
                value={rowStart}
                onChange={(event) => setRowStart(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="anova-row-end" className={fieldLabelClass}>
                Last row
              </Label>
              <Input
                id="anova-row-end"
                data-testid="anova-row-end"
                inputMode="numeric"
                placeholder="All"
                value={rowEnd}
                onChange={(event) => setRowEnd(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="anova-title" className={fieldLabelClass}>
              Title (optional)
            </Label>
            <Input
              id="anova-title"
              data-testid="anova-title"
              value={title}
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
                responseColumnId,
                factorColumnId,
                title: resolvedTitle,
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
