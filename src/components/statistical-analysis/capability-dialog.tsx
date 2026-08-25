"use client";

import { useMemo, useState } from "react";
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
import { WARN_VALUES_FOR_SIXPACK } from "@/lib/statistical-analysis/types";
import {
  columnNumericValues,
  findColumn,
} from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

export type CapabilityDialogValues = {
  columnId: string;
  title: string;
  lsl: number | null;
  usl: number | null;
  target: number | null;
};

function parseOptionalNumber(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

export function CapabilityDialog({
  open,
  worksheet,
  defaultColumnId,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  worksheet: WorksheetData;
  defaultColumnId: string;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CapabilityDialogValues) => void;
}) {
  const [columnId, setColumnId] = useState(defaultColumnId);
  const [title, setTitle] = useState("");
  const [lsl, setLsl] = useState("90");
  const [usl, setUsl] = useState("110");
  const [target, setTarget] = useState("100");

  const selectedColumn = findColumn(worksheet, columnId) ?? worksheet.columns[0];
  const numeric = useMemo(
    () =>
      selectedColumn
        ? columnNumericValues(selectedColumn)
        : { values: [], skipped: 0 },
    [selectedColumn]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="capability-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Normal Capability Sixpack</DialogTitle>
          <DialogDescription>
            Individuals / moving range (I-MR). Choose a numeric column and at
            least one specification limit.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sixpack-column" className={fieldLabelClass}>
              Data column
            </Label>
            <Select value={columnId} onValueChange={setColumnId}>
              <SelectTrigger id="sixpack-column" data-testid="sixpack-column">
                <SelectValue placeholder="Select a column" />
              </SelectTrigger>
              <SelectContent>
                {worksheet.columns.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[var(--muted-foreground)]">
              {numeric.values.length} numeric value
              {numeric.values.length === 1 ? "" : "s"}
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

          <div className="grid gap-1.5">
            <Label htmlFor="sixpack-title" className={fieldLabelClass}>
              Title (optional)
            </Label>
            <Input
              id="sixpack-title"
              value={title}
              placeholder={selectedColumn?.name ?? "Analysis title"}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

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
                title: title.trim(),
                lsl: parseOptionalNumber(lsl),
                usl: parseOptionalNumber(usl),
                target: parseOptionalNumber(target),
              })
            }
          >
            {submitting ? "Running…" : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
