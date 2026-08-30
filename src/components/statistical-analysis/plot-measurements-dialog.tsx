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

export type PlotMeasurementsDialogValues = {
  query: string;
  title: string;
  xLabel: string;
  yLabel: string;
  mode: "combined" | "per-series";
  lsl: number | null;
  usl: number | null;
};

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

function parseOptionalNumber(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function PlotMeasurementsDialog({
  open,
  defaultQuery = "",
  defaultTitle = "",
  defaultXLabel = "",
  defaultYLabel = "",
  defaultMode = "combined" as "combined" | "per-series",
  defaultLsl = null,
  defaultUsl = null,
  editMode = false,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  defaultQuery?: string;
  defaultTitle?: string;
  defaultXLabel?: string;
  defaultYLabel?: string;
  defaultMode?: "combined" | "per-series";
  defaultLsl?: number | null;
  defaultUsl?: number | null;
  editMode?: boolean;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PlotMeasurementsDialogValues) => void;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [title, setTitle] = useState(defaultTitle);
  const [xLabel, setXLabel] = useState(defaultXLabel);
  const [yLabel, setYLabel] = useState(defaultYLabel);
  const [mode, setMode] = useState<"combined" | "per-series">(defaultMode);
  const [lsl, setLsl] = useState(
    defaultLsl == null ? "" : String(defaultLsl)
  );
  const [usl, setUsl] = useState(
    defaultUsl == null ? "" : String(defaultUsl)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="plot-measurements-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Plot from attachments</DialogTitle>
          <DialogDescription>
            Extract cited numeric measurements from this report&apos;s
            attachments and save a scatter of that series versus observation
            index in Results. One series, one color — this is not a grouped
            overlay. Use a requirement ID or measurement name, for example Assay
            or REQ-042. LSL and USL are optional — leave them blank to use
            limits cited in the files.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="plot-query" className={fieldLabelClass}>
              Query
            </Label>
            <Input
              id="plot-query"
              data-testid="plot-query"
              value={query}
              placeholder="Assay"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="plot-title" className={fieldLabelClass}>
              Title (optional)
            </Label>
            <Input
              id="plot-title"
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
            data-testid="plot-measurements-submit"
            disabled={submitting || !query.trim()}
            onClick={() =>
              onSubmit({
                query: query.trim(),
                title: title.trim(),
                xLabel: xLabel.trim(),
                yLabel: yLabel.trim(),
                mode,
                lsl: parseOptionalNumber(lsl),
                usl: parseOptionalNumber(usl),
              })
            }
          >
            {submitting
              ? editMode
                ? "Updating…"
                : "Extracting…"
              : editMode
                ? "Update"
                : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
