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
import type { AnovaDialogValues } from "@/components/statistical-analysis/anova-dialog";
import type { CapabilityDialogValues } from "@/components/statistical-analysis/capability-dialog";
import type { PlotMeasurementsDialogValues } from "@/components/statistical-analysis/plot-measurements-dialog";
import { suggestFactorColumn } from "@/lib/statistical-analysis/anova";
import {
  formatRowSelection,
  normalizeRowSelection,
} from "@/lib/statistical-analysis/row-selection";
import {
  CAPABILITY_SIXPACK_NORMAL,
  MEASUREMENT_SCATTER,
  ONE_WAY_ANOVA,
  WARN_VALUES_FOR_SIXPACK,
  type AnalysisKind,
  type WorksheetData,
} from "@/lib/statistical-analysis/types";
import {
  columnNumericValues,
  dataSheets,
  defaultSixpackLimits,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";

export type AnalyzeDialogSubmit =
  | { kind: typeof CAPABILITY_SIXPACK_NORMAL; values: CapabilityDialogValues }
  | { kind: typeof ONE_WAY_ANOVA; values: AnovaDialogValues }
  | { kind: typeof MEASUREMENT_SCATTER; values: PlotMeasurementsDialogValues };

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

const PLOT_TYPES: { value: AnalysisKind; label: string }[] = [
  { value: CAPABILITY_SIXPACK_NORMAL, label: "Normal Capability Sixpack" },
  { value: ONE_WAY_ANOVA, label: "One-Way ANOVA" },
  { value: MEASUREMENT_SCATTER, label: "Plot measurements" },
];

export function AnalyzeDialog({
  open,
  worksheet,
  defaultColumnId,
  defaultRowStart = null,
  defaultRowEnd = null,
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
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: AnalyzeDialogSubmit) => void;
}) {
  const fallbackColumnId = defaultColumnId || worksheet.columns[0]?.id || "";
  const initialRowStart =
    defaultRowStart != null ? String(defaultRowStart) : "";
  const initialRowEnd = defaultRowEnd != null ? String(defaultRowEnd) : "";
  const initialLimits = limitsForColumn(
    worksheet,
    fallbackColumnId,
    initialRowStart,
    initialRowEnd
  );
  const initialColumn =
    findColumn(worksheet, fallbackColumnId) ?? worksheet.columns[0];

  const [kind, setKind] = useState<AnalysisKind>(CAPABILITY_SIXPACK_NORMAL);
  const [columnId, setColumnId] = useState(fallbackColumnId);
  const [factorColumnId, setFactorColumnId] = useState(
    () => suggestFactorColumn(worksheet, fallbackColumnId) ?? ""
  );
  const [title, setTitle] = useState("");
  const [lsl, setLsl] = useState(initialLimits.lsl);
  const [usl, setUsl] = useState(initialLimits.usl);
  const [target, setTarget] = useState(initialLimits.target);
  const [rowStart, setRowStart] = useState(initialRowStart);
  const [rowEnd, setRowEnd] = useState(initialRowEnd);
  const [query, setQuery] = useState(initialColumn?.name ?? "");
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");
  const [mode, setMode] = useState<"combined" | "per-series">("combined");

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
    const previous = findColumn(worksheet, columnId);
    const next = findColumn(worksheet, nextColumnId);
    setColumnId(nextColumnId);
    applyColumnLimits(nextColumnId, rowStart, rowEnd);
    if (next && (!query.trim() || query === previous?.name)) {
      setQuery(next.name);
    }
    if (nextColumnId === factorColumnId) {
      setFactorColumnId(suggestFactorColumn(worksheet, nextColumnId) ?? "");
    }
  };

  const selectedColumn = findColumn(worksheet, columnId) ?? worksheet.columns[0];
  const factorColumn = findColumn(worksheet, factorColumnId);
  const sheets = dataSheets(worksheet);
  const rowSelection = normalizeRowSelection({
    rowStart: parseOptionalRow(rowStart),
    rowEnd: parseOptionalRow(rowEnd),
  });
  const numeric = selectedColumn
    ? columnNumericValues(selectedColumn, rowSelection)
    : { values: [], skipped: 0 };
  const rowLabel = formatRowSelection(rowSelection);
  const sixpackTitlePlaceholder = rowLabel
    ? `${selectedColumn?.name ?? "Analysis"} (${rowLabel})`
    : (selectedColumn?.name ?? "Analysis title");
  const anovaTitlePlaceholder =
    selectedColumn && factorColumn
      ? rowLabel
        ? `${selectedColumn.name} by ${factorColumn.name} (${rowLabel})`
        : `${selectedColumn.name} by ${factorColumn.name}`
      : "Analysis title";
  const anovaCanSubmit =
    Boolean(columnId) &&
    Boolean(factorColumnId) &&
    columnId !== factorColumnId;
  const canSubmit =
    kind === MEASUREMENT_SCATTER
      ? Boolean(query.trim())
      : kind === ONE_WAY_ANOVA
        ? anovaCanSubmit
        : Boolean(columnId);

  const description =
    kind === ONE_WAY_ANOVA
      ? "Compare means of a numeric response across factor levels on the same data sheet. Pairwise tests use Bonferroni-adjusted t-tests with the ANOVA MSE."
      : kind === MEASUREMENT_SCATTER
        ? "Extract cited numeric measurements from this report's attachments and save a scatter of that series versus observation index in Results. One series, one color — not a grouped overlay. Query and limits start from the selected column and can be edited."
        : "Individuals / moving range (I-MR). Values are filled from the selected column and can be edited before you run the plot.";

  const submit = () => {
    if (kind === ONE_WAY_ANOVA) {
      onSubmit({
        kind: ONE_WAY_ANOVA,
        values: {
          responseColumnId: columnId,
          factorColumnId,
          title: title.trim(),
          rowStart: parseOptionalRow(rowStart),
          rowEnd: parseOptionalRow(rowEnd),
        },
      });
      return;
    }
    if (kind === MEASUREMENT_SCATTER) {
      onSubmit({
        kind: MEASUREMENT_SCATTER,
        values: {
          query: query.trim(),
          title: title.trim(),
          xLabel: xLabel.trim(),
          yLabel: yLabel.trim(),
          mode,
          lsl: parseOptionalNumber(lsl),
          usl: parseOptionalNumber(usl),
        },
      });
      return;
    }
    onSubmit({
      kind: CAPABILITY_SIXPACK_NORMAL,
      values: {
        columnId,
        title: title.trim(),
        lsl: parseOptionalNumber(lsl),
        usl: parseOptionalNumber(usl),
        target: parseOptionalNumber(target),
        rowStart: parseOptionalRow(rowStart),
        rowEnd: parseOptionalRow(rowEnd),
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
            <Label htmlFor="analyze-plot-type" className={fieldLabelClass}>
              Plot type
            </Label>
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as AnalysisKind)}
            >
              <SelectTrigger
                id="analyze-plot-type"
                data-testid="analyze-plot-type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLOT_TYPES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind === MEASUREMENT_SCATTER ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="plot-query" className={fieldLabelClass}>
                  Query
                </Label>
                <Input
                  id="plot-query"
                  data-testid="plot-query"
                  value={query}
                  placeholder="M3-SYS-FN-037"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="analyze-scatter-title" className={fieldLabelClass}>
                  Title (optional)
                </Label>
                <Input
                  id="analyze-scatter-title"
                  value={title}
                  placeholder={query.trim() || "Chart title"}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="plot-x-label" className={fieldLabelClass}>
                    X label
                  </Label>
                  <Input
                    id="plot-x-label"
                    value={xLabel}
                    placeholder="Measurement"
                    onChange={(event) => setXLabel(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="plot-y-label" className={fieldLabelClass}>
                    Y label
                  </Label>
                  <Input
                    id="plot-y-label"
                    value={yLabel}
                    placeholder="Value"
                    onChange={(event) => setYLabel(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="plot-layout" className={fieldLabelClass}>
                  Layout
                </Label>
                <Select
                  value={mode}
                  onValueChange={(value) =>
                    setMode(value === "per-series" ? "per-series" : "combined")
                  }
                >
                  <SelectTrigger id="plot-layout" data-testid="plot-layout">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="combined">One combined chart</SelectItem>
                    <SelectItem value="per-series">One chart per series</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="plot-lsl" className={fieldLabelClass}>
                    LSL (optional)
                  </Label>
                  <Input
                    id="plot-lsl"
                    data-testid="plot-lsl"
                    inputMode="decimal"
                    value={lsl}
                    placeholder="From attachments"
                    onChange={(event) => setLsl(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="plot-usl" className={fieldLabelClass}>
                    USL (optional)
                  </Label>
                  <Input
                    id="plot-usl"
                    data-testid="plot-usl"
                    inputMode="decimal"
                    value={usl}
                    placeholder="From attachments"
                    onChange={(event) => setUsl(event.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
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
                    <Label htmlFor="anova-factor" className={fieldLabelClass}>
                      Factor
                    </Label>
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
              <p className="-mt-2 text-xs text-[var(--muted-foreground)]">
                Worksheet rows are numbered from 1. Leave both blank to use the
                whole column.
              </p>

              <div className="grid gap-1.5">
                <Label htmlFor="analyze-title" className={fieldLabelClass}>
                  Title (optional)
                </Label>
                <Input
                  id="analyze-title"
                  value={title}
                  placeholder={
                    kind === ONE_WAY_ANOVA
                      ? anovaTitlePlaceholder
                      : sixpackTitlePlaceholder
                  }
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              {kind === CAPABILITY_SIXPACK_NORMAL ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="sixpack-lsl" className={fieldLabelClass}>
                      LSL
                    </Label>
                    <Input
                      id="sixpack-lsl"
                      data-testid="sixpack-lsl"
                      inputMode="decimal"
                      value={lsl}
                      onChange={(event) => setLsl(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="sixpack-target" className={fieldLabelClass}>
                      Target
                    </Label>
                    <Input
                      id="sixpack-target"
                      data-testid="sixpack-target"
                      inputMode="decimal"
                      value={target}
                      onChange={(event) => setTarget(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="sixpack-usl" className={fieldLabelClass}>
                      USL
                    </Label>
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
            </>
          )}

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
            {submitting
              ? kind === MEASUREMENT_SCATTER
                ? "Extracting…"
                : "Running…"
              : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
