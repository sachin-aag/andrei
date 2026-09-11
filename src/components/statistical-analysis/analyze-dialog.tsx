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
import type { AnovaDialogValues } from "@/components/statistical-analysis/anova-dialog";
import type { CapabilityDialogValues } from "@/components/statistical-analysis/capability-dialog";
import { FieldInfoIcon } from "@/components/statistical-analysis/field-info";
import { suggestFactorColumn } from "@/lib/statistical-analysis/anova";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import {
  CAPABILITY_SIXPACK_NORMAL,
  ONE_WAY_ANOVA,
  WARN_VALUES_FOR_SIXPACK,
  type WorksheetData,
} from "@/lib/statistical-analysis/types";
import {
  analyzePlotTypeHelpText,
  isAnalyzeInlinePlotKind,
  WORKSHEET_PLOT_CATALOG,
  type AnalyzeInlinePlotKind,
  type WorksheetPlotKind,
} from "@/lib/statistical-analysis/plot-catalog";
import {
  ANALYSIS_ROW_RANGE_HELP,
  analysisRowFieldDefaults,
  collapseFilledAnalysisRows,
  columnNumericValues,
  dataSheets,
  defaultSixpackLimits,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";

export type AnalyzeDialogSubmit =
  | { kind: typeof CAPABILITY_SIXPACK_NORMAL; values: CapabilityDialogValues }
  | { kind: typeof ONE_WAY_ANOVA; values: AnovaDialogValues };

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

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

export function AnalyzeDialog({
  open,
  worksheet,
  defaultColumnId,
  defaultRowStart = null,
  defaultRowEnd = null,
  submitting,
  error,
  onOpenChange,
  onHandoff,
  onSubmit,
}: {
  open: boolean;
  worksheet: WorksheetData;
  defaultColumnId: string;
  defaultRowStart?: number | null;
  defaultRowEnd?: number | null;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onHandoff: (kind: WorksheetPlotKind) => void;
  onSubmit: (payload: AnalyzeDialogSubmit) => void;
}) {
  const fallbackColumnId = defaultColumnId || worksheet.columns[0]?.id || "";
  const initialRows = analysisRowFieldDefaults(
    findColumn(worksheet, fallbackColumnId) ?? worksheet.columns[0],
    { rowStart: defaultRowStart, rowEnd: defaultRowEnd }
  );
  const initialRowStart = initialRows.rowStart;
  const initialRowEnd = initialRows.rowEnd;
  const initialLimits = limitsForColumn(
    worksheet,
    fallbackColumnId,
    initialRowStart,
    initialRowEnd
  );
  const [kind, setKind] = useState<AnalyzeInlinePlotKind>(
    CAPABILITY_SIXPACK_NORMAL
  );
  const [columnId, setColumnId] = useState(fallbackColumnId);
  const [factorColumnId, setFactorColumnId] = useState(
    () => suggestFactorColumn(worksheet, fallbackColumnId) ?? ""
  );
  const [lsl, setLsl] = useState(initialLimits.lsl);
  const [usl, setUsl] = useState(initialLimits.usl);
  const [target, setTarget] = useState(initialLimits.target);
  const [rowStart, setRowStart] = useState(initialRowStart);
  const [rowEnd, setRowEnd] = useState(initialRowEnd);

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

  const changeColumn = (nextColumnId: string) => {
    setColumnId(nextColumnId);
    const nextRows = analysisRowFieldDefaults(
      findColumn(worksheet, nextColumnId) ?? worksheet.columns[0]
    );
    setRowStart(nextRows.rowStart);
    setRowEnd(nextRows.rowEnd);
    applyColumnLimits(nextColumnId, nextRows.rowStart, nextRows.rowEnd);
    if (nextColumnId === factorColumnId) {
      setFactorColumnId(suggestFactorColumn(worksheet, nextColumnId) ?? "");
    }
  };

  const selectedColumn = findColumn(worksheet, columnId) ?? worksheet.columns[0];
  const factorColumn = findColumn(worksheet, factorColumnId);
  const sheets = dataSheets(worksheet);
  const submittedRows = collapseFilledAnalysisRows(
    selectedColumn,
    parseOptionalRow(rowStart),
    parseOptionalRow(rowEnd)
  );
  const rowSelection = normalizeRowSelection(submittedRows);
  const numeric = selectedColumn
    ? columnNumericValues(selectedColumn, rowSelection)
    : { values: [], skipped: 0 };
  const rowLabel = formatRowSelection(rowSelection);
  const suggestedTitle =
    kind === ONE_WAY_ANOVA
      ? selectedColumn && factorColumn
        ? rowLabel
          ? `${selectedColumn.name} by ${factorColumn.name} (${rowLabel})`
          : `${selectedColumn.name} by ${factorColumn.name}`
        : "Analysis title"
      : rowLabel
        ? `${selectedColumn?.name ?? "Analysis"} (${rowLabel})`
        : (selectedColumn?.name ?? "Analysis title");
  const { title, setTitle, resolvedTitle } = usePlotTitle(suggestedTitle);
  const anovaCanSubmit =
    Boolean(columnId) &&
    Boolean(factorColumnId) &&
    columnId !== factorColumnId;
  const canSubmit =
    kind === ONE_WAY_ANOVA ? anovaCanSubmit : Boolean(columnId);

  const description =
    kind === ONE_WAY_ANOVA
      ? "Compare a numeric response across groups."
      : "I-MR capability for the selected column.";

  const submit = () => {
    if (kind === ONE_WAY_ANOVA) {
      onSubmit({
        kind: ONE_WAY_ANOVA,
        values: {
          responseColumnId: columnId,
          factorColumnId,
          title: resolvedTitle,
          rowStart: submittedRows.rowStart,
          rowEnd: submittedRows.rowEnd,
        },
      });
      return;
    }
    onSubmit({
      kind: CAPABILITY_SIXPACK_NORMAL,
      values: {
        columnId,
        title: resolvedTitle,
        lsl: parseOptionalNumber(lsl),
        usl: parseOptionalNumber(usl),
        target: parseOptionalNumber(target),
        rowStart: submittedRows.rowStart,
        rowEnd: submittedRows.rowEnd,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="analyze-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Analyze data</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="analyze-plot-type" className={fieldLabelClass}>
                Plot type
              </Label>
              <FieldInfoIcon
                label="Plot type"
                testId="analyze-plot-type-info"
                text={analyzePlotTypeHelpText()}
              />
            </div>
            <Select
              value={kind}
              onValueChange={(value) => {
                const next = value as WorksheetPlotKind;
                if (isAnalyzeInlinePlotKind(next)) {
                  setKind(next);
                  return;
                }
                onHandoff(next);
              }}
            >
              <SelectTrigger
                id="analyze-plot-type"
                data-testid="analyze-plot-type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKSHEET_PLOT_CATALOG.map((item) => (
                  <SelectItem key={item.kind} value={item.kind}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind === ONE_WAY_ANOVA ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="anova-response" className={fieldLabelClass}>
                      Response
                    </Label>
                    <Select value={columnId} onValueChange={changeColumn}>
                      <SelectTrigger
                        id="anova-response"
                        data-testid="anova-response"
                      >
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
                            .filter((column) => column.id !== columnId)
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
                </>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="sixpack-column" className={fieldLabelClass}>
                    Data column
                  </Label>
                  <Select value={columnId} onValueChange={changeColumn}>
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
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <div className="flex items-center gap-1">
                    <Label
                      htmlFor={
                        kind === ONE_WAY_ANOVA
                          ? "anova-row-start"
                          : "sixpack-row-start"
                      }
                      className={fieldLabelClass}
                    >
                      First row
                    </Label>
                    <FieldInfoIcon
                      label="Row range"
                      testId="analyze-row-range-info"
                      text={ANALYSIS_ROW_RANGE_HELP}
                    />
                  </div>
                  <Input
                    id={
                      kind === ONE_WAY_ANOVA
                        ? "anova-row-start"
                        : "sixpack-row-start"
                    }
                    data-testid={
                      kind === ONE_WAY_ANOVA
                        ? "anova-row-start"
                        : "sixpack-row-start"
                    }
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
                  <Label
                    htmlFor={
                      kind === ONE_WAY_ANOVA ? "anova-row-end" : "sixpack-row-end"
                    }
                    className={fieldLabelClass}
                  >
                    Last row
                  </Label>
                  <Input
                    id={
                      kind === ONE_WAY_ANOVA ? "anova-row-end" : "sixpack-row-end"
                    }
                    data-testid={
                      kind === ONE_WAY_ANOVA ? "anova-row-end" : "sixpack-row-end"
                    }
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
                <Label htmlFor="analyze-title" className={fieldLabelClass}>
                  Title (optional)
                </Label>
                <Input
                  id="analyze-title"
                  data-testid="analyze-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              {kind === CAPABILITY_SIXPACK_NORMAL ? (
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
            data-testid="analyze-dialog-submit"
            disabled={submitting || !canSubmit}
            onClick={submit}
          >
            {submitting ? "Running…" : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
