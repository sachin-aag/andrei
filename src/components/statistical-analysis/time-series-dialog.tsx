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
import { timeSeriesFallbackTitle } from "@/lib/statistical-analysis/types";
import { suggestTimeSeriesColumns } from "@/lib/statistical-analysis/column-roles";
import {
  parseTimestampCell,
  timeSeriesLimitsFromColumnSpecs,
} from "@/lib/statistical-analysis/time-series";
import {
  ANALYSIS_ROW_RANGE_HELP,
  analysisRowFieldDefaults,
  cellsForRowSelection,
  collapseFilledAnalysisRows,
  columnNumericValues,
  dataSheets,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import type {
  TimeSeriesBand,
  WorksheetData,
} from "@/lib/statistical-analysis/types";

export type TimeSeriesDialogValues = {
  columnId: string;
  timeColumnId: string;
  clockColumnId: string | null;
  title: string;
  lsl: number | null;
  usl: number | null;
  conditionColumnId: string | null;
  bands: TimeSeriesBand[] | null;
  showSpecLimits: boolean;
  showExcursions: boolean;
  rowStart: number | null;
  rowEnd: number | null;
};

const NONE = "__none__";

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

/**
 * One line per band: `800 650 950`, or `800 650-950`. Typing four bands is
 * faster than four rows of paired inputs, and it matches how a recipe is
 * written down in the first place.
 */
export function parseBandLines(raw: string): {
  bands: TimeSeriesBand[];
  invalid: string[];
} {
  const bands: TimeSeriesBand[] = [];
  const invalid: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    const parts = text.split(/[\s,]+/).filter(Boolean);
    const [when, ...rest] = parts;
    const limits =
      rest.length === 1 && rest[0]!.includes("-")
        ? rest[0]!.split("-")
        : rest;
    if (!when || limits.length !== 2) {
      invalid.push(text);
      continue;
    }
    const lsl = Number(limits[0]);
    const usl = Number(limits[1]);
    if (!Number.isFinite(lsl) || !Number.isFinite(usl) || !(lsl < usl)) {
      invalid.push(text);
      continue;
    }
    bands.push({ when, lsl, usl });
  }
  return { bands, invalid };
}

export function formatBandLines(bands: readonly TimeSeriesBand[]): string {
  return bands
    .map((band) => `${band.when} ${band.lsl ?? ""} ${band.usl ?? ""}`.trim())
    .join("\n");
}

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

export function TimeSeriesDialog({
  open,
  worksheet,
  defaultColumnId,
  defaultTimeColumnId = "",
  defaultClockColumnId = null,
  defaultRowStart = null,
  defaultRowEnd = null,
  defaultTitle = "",
  defaultLsl = null,
  defaultUsl = null,
  defaultConditionColumnId = null,
  defaultBands = null,
  defaultShowSpecLimits = true,
  defaultShowExcursions = true,
  editMode = false,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  worksheet: WorksheetData;
  defaultColumnId: string;
  defaultTimeColumnId?: string;
  defaultClockColumnId?: string | null;
  defaultRowStart?: number | null;
  defaultRowEnd?: number | null;
  defaultTitle?: string;
  defaultLsl?: number | null;
  defaultUsl?: number | null;
  defaultConditionColumnId?: string | null;
  defaultBands?: TimeSeriesBand[] | null;
  defaultShowSpecLimits?: boolean;
  defaultShowExcursions?: boolean;
  editMode?: boolean;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TimeSeriesDialogValues) => void;
}) {
  const sheets = dataSheets(worksheet);
  const initialLimits = editMode
    ? { lsl: formatLimitInput(defaultLsl), usl: formatLimitInput(defaultUsl) }
    : limitsForColumn(worksheet, defaultColumnId);
  const initialRows = analysisRowFieldDefaults(
    findColumn(worksheet, defaultColumnId) ?? worksheet.columns[0],
    { rowStart: defaultRowStart, rowEnd: defaultRowEnd }
  );
  const [columnId, setColumnId] = useState(defaultColumnId);
  // Same inference the chat tool uses, so the dialog and a prompt agree about
  // which column is the clock and which carries the setpoint.
  const suggested = suggestTimeSeriesColumns(
    sheets.flatMap((sheet) => sheet.columns),
    { measurementHint: findColumn(worksheet, defaultColumnId)?.name }
  );
  const [timeColumnId, setTimeColumnId] = useState(
    defaultTimeColumnId || suggested.timeColumnId || ""
  );
  const [clockColumnId, setClockColumnId] = useState(
    defaultClockColumnId ?? suggested.clockColumnId ?? ""
  );
  const [lsl, setLsl] = useState(initialLimits.lsl);
  const [usl, setUsl] = useState(initialLimits.usl);
  const [conditionColumnId, setConditionColumnId] = useState(
    defaultConditionColumnId ?? (editMode ? "" : (suggested.conditionColumnId ?? ""))
  );
  const [bandText, setBandText] = useState(
    defaultBands ? formatBandLines(defaultBands) : ""
  );
  const [showSpecLimits, setShowSpecLimits] = useState(defaultShowSpecLimits);
  const [showExcursions, setShowExcursions] = useState(defaultShowExcursions);
  const [rowStart, setRowStart] = useState(initialRows.rowStart);
  const [rowEnd, setRowEnd] = useState(initialRows.rowEnd);

  const selectedColumn = findColumn(worksheet, columnId) ?? worksheet.columns[0];
  const timeColumn = timeColumnId ? findColumn(worksheet, timeColumnId) : undefined;
  const submittedRows = collapseFilledAnalysisRows(
    selectedColumn,
    parseOptionalRow(rowStart),
    parseOptionalRow(rowEnd)
  );
  const rowSelection = normalizeRowSelection(submittedRows);
  const numeric = selectedColumn
    ? columnNumericValues(selectedColumn, rowSelection)
    : { values: [], skipped: 0 };
  const clockColumn = clockColumnId
    ? findColumn(worksheet, clockColumnId)
    : undefined;
  const readableStamps = timeColumn
    ? countReadableTimestamps(
        cellsForRowSelection(timeColumn, rowSelection),
        clockColumn ? cellsForRowSelection(clockColumn, rowSelection) : []
      )
    : 0;
  const rowLabel = formatRowSelection(rowSelection);
  const parsedBands = parseBandLines(bandText);
  const conditionColumn = conditionColumnId
    ? findColumn(worksheet, conditionColumnId)
    : undefined;
  // Knowing which values the column takes is the hard part of writing bands —
  // the engineer should not have to scroll 2,000 rows to find out.
  const conditionValues = conditionColumn
    ? [
        ...new Set(
          conditionColumn.values
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        ),
      ]
        .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
        .slice(0, 16)
    : [];
  const bandedValues = new Set(parsedBands.bands.map((band) => band.when.trim()));
  const unbanded = conditionValues.filter((value) => !bandedValues.has(value));
  const suggestedTitle = selectedColumn
    ? timeSeriesFallbackTitle(selectedColumn.name, rowLabel)
    : "Time series title";
  const { title, setTitle, resolvedTitle } = usePlotTitle(
    suggestedTitle,
    defaultTitle
  );

  const columnOptions = sheets.flatMap((sheet) =>
    sheet.columns.map((column) => ({
      id: column.id,
      label:
        sheets.length > 1 ? `${sheet.name}: ${column.name}` : column.name,
    }))
  );

  const bandsInvalid = parsedBands.invalid.length > 0;
  // Mirrors `judgedReadings === 0` on the server: a plot with no limits is a
  // legitimate thing to want, but it must never look like a pass.
  const nothingWillBeJudged =
    parseOptionalNumber(lsl) == null &&
    parseOptionalNumber(usl) == null &&
    !(conditionColumnId && parsedBands.bands.length > 0);
  const bandsNeedColumn = parsedBands.bands.length > 0 && !conditionColumnId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="time-series-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Time series</DialogTitle>
          <DialogDescription>
            A measurement against a clock, with the out-of-band runs named.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label htmlFor="time-series-column" className={fieldLabelClass}>
              Measurement column
            </Label>
            <Select
              value={columnId}
              onValueChange={(value) => {
                setColumnId(value);
                const next = limitsForColumn(worksheet, value);
                setLsl(next.lsl);
                setUsl(next.usl);
                const nextRows = analysisRowFieldDefaults(
                  findColumn(worksheet, value) ?? worksheet.columns[0]
                );
                setRowStart(nextRows.rowStart);
                setRowEnd(nextRows.rowEnd);
              }}
            >
              <SelectTrigger
                id="time-series-column"
                data-testid="time-series-column"
              >
                <SelectValue placeholder="Select a column" />
              </SelectTrigger>
              <SelectContent>
                {columnOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
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
                <Label htmlFor="time-series-time" className={fieldLabelClass}>
                  Date column
                </Label>
                <FieldInfoIcon
                  label="Date column"
                  testId="time-series-time-info"
                  text="The date, or a full date and time in one column. Instrument prints usually split them — set the time of day next to it."
                />
              </div>
              <Select value={timeColumnId} onValueChange={setTimeColumnId}>
                <SelectTrigger
                  id="time-series-time"
                  data-testid="time-series-time-column"
                >
                  <SelectValue placeholder="Select a column" />
                </SelectTrigger>
                <SelectContent>
                  {columnOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time-series-clock" className={fieldLabelClass}>
                Time of day (optional)
              </Label>
              <Select
                value={clockColumnId || NONE}
                onValueChange={(value) =>
                  setClockColumnId(value === NONE ? "" : value)
                }
              >
                <SelectTrigger
                  id="time-series-clock"
                  data-testid="time-series-clock-column"
                >
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {columnOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p
            className="text-xs text-[var(--muted-foreground)]"
            data-testid="time-series-stamp-count"
          >
            {readableStamps} readable timestamp
            {readableStamps === 1 ? "" : "s"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-1">
                <Label
                  htmlFor="time-series-row-start"
                  className={fieldLabelClass}
                >
                  First row
                </Label>
                <FieldInfoIcon
                  label="Row range"
                  testId="time-series-row-range-info"
                  text={ANALYSIS_ROW_RANGE_HELP}
                />
              </div>
              <Input
                id="time-series-row-start"
                data-testid="time-series-row-start"
                inputMode="numeric"
                placeholder="All"
                value={rowStart}
                onChange={(event) => setRowStart(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time-series-row-end" className={fieldLabelClass}>
                Last row
              </Label>
              <Input
                id="time-series-row-end"
                data-testid="time-series-row-end"
                inputMode="numeric"
                placeholder="All"
                value={rowEnd}
                onChange={(event) => setRowEnd(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="time-series-title" className={fieldLabelClass}>
              Title (optional)
            </Label>
            <Input
              id="time-series-title"
              data-testid="time-series-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="time-series-lsl" className={fieldLabelClass}>
                LSL
              </Label>
              <Input
                id="time-series-lsl"
                data-testid="time-series-lsl"
                inputMode="decimal"
                value={lsl}
                onChange={(event) => setLsl(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time-series-usl" className={fieldLabelClass}>
                USL
              </Label>
              <Input
                id="time-series-usl"
                data-testid="time-series-usl"
                inputMode="decimal"
                value={usl}
                onChange={(event) => setUsl(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center gap-1">
              <Label
                htmlFor="time-series-condition"
                className={fieldLabelClass}
              >
                Limits depend on (optional)
              </Label>
              <FieldInfoIcon
                label="Conditional limits"
                testId="time-series-condition-info"
                text="A column whose value picks the band for each reading — a recorded setpoint, a stability timepoint, a product grade. Leave unset for one fixed band."
              />
            </div>
            <Select
              value={conditionColumnId || NONE}
              onValueChange={(value) =>
                setConditionColumnId(value === NONE ? "" : value)
              }
            >
              <SelectTrigger
                id="time-series-condition"
                data-testid="time-series-condition-column"
              >
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {columnOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {conditionColumnId ? (
            <div className="grid gap-1.5">
              <Label htmlFor="time-series-bands" className={fieldLabelClass}>
                Bands
              </Label>
              <textarea
                id="time-series-bands"
                data-testid="time-series-bands"
                rows={4}
                spellCheck={false}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
                placeholder={"800 650 950\n600 480 720\n500 380 620"}
                value={bandText}
                onChange={(event) => setBandText(event.target.value)}
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                One per line: the value in that column, then the lower and upper
                limit.
                {parsedBands.bands.length > 0
                  ? ` ${parsedBands.bands.length} band${parsedBands.bands.length === 1 ? "" : "s"} read.`
                  : ""}
              </p>
              {conditionValues.length > 0 ? (
                <p
                  className="text-xs text-[var(--muted-foreground)]"
                  data-testid="time-series-condition-values"
                >
                  {conditionColumn?.name} takes: {conditionValues.join(", ")}.
                  {unbanded.length > 0
                    ? ` Rows at ${unbanded.join(", ")} have no band and will not be assessed.`
                    : ""}
                </p>
              ) : null}
              {bandsInvalid ? (
                <p className="text-xs text-[var(--destructive)]" role="alert">
                  Could not read: {parsedBands.invalid.join("; ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="time-series-show-limits"
                data-testid="time-series-show-limits"
                checked={showSpecLimits}
                onCheckedChange={(next) => setShowSpecLimits(next === true)}
              />
              <Label
                htmlFor="time-series-show-limits"
                className={`${fieldLabelClass} cursor-pointer font-normal`}
              >
                Show acceptance band
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="time-series-show-excursions"
                data-testid="time-series-show-excursions"
                checked={showExcursions}
                onCheckedChange={(next) => setShowExcursions(next === true)}
              />
              <Label
                htmlFor="time-series-show-excursions"
                className={`${fieldLabelClass} cursor-pointer font-normal`}
              >
                Shade excursions
              </Label>
            </div>
          </div>

          {nothingWillBeJudged ? (
            <p
              className="text-sm text-[var(--destructive)]"
              role="alert"
              data-testid="time-series-no-limits-warning"
            >
              No acceptance limits set, so excursions will not be assessed —
              the result will say so rather than reporting none. Set LSL/USL,
              or a column the limits depend on and its bands.
            </p>
          ) : null}
          {bandsNeedColumn ? (
            <p className="text-sm text-[var(--destructive)]" role="alert">
              Choose the column those bands depend on.
            </p>
          ) : null}
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
            data-testid="time-series-ok"
            disabled={
              submitting ||
              !columnId ||
              !timeColumnId ||
              bandsInvalid ||
              bandsNeedColumn
            }
            onClick={() =>
              onSubmit({
                columnId,
                timeColumnId,
                clockColumnId: clockColumnId || null,
                title: resolvedTitle,
                lsl: parseOptionalNumber(lsl),
                usl: parseOptionalNumber(usl),
                conditionColumnId: conditionColumnId || null,
                bands:
                  conditionColumnId && parsedBands.bands.length > 0
                    ? parsedBands.bands
                    : null,
                showSpecLimits,
                showExcursions,
                rowStart: submittedRows.rowStart,
                rowEnd: submittedRows.rowEnd,
              })
            }
          >
            {submitting
              ? editMode
                ? "Updating…"
                : "Running…"
              : editMode
                ? "Update"
                : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function limitsForColumn(
  worksheet: WorksheetData,
  columnId: string
): { lsl: string; usl: string } {
  const selected = findColumn(worksheet, columnId) ?? worksheet.columns[0];
  if (!selected) return { lsl: "", usl: "" };
  const limits = timeSeriesLimitsFromColumnSpecs(worksheet, selected.name);
  return {
    lsl: formatLimitInput(limits.lsl),
    usl: formatLimitInput(limits.usl),
  };
}

function countReadableTimestamps(
  dates: readonly string[],
  clocks: readonly string[]
): number {
  let count = 0;
  for (let i = 0; i < dates.length; i += 1) {
    if (parseTimestampCell(dates[i] ?? "", clocks[i]) !== null) count += 1;
  }
  return count;
}
