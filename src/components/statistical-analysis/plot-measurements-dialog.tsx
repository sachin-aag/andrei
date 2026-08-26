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
};

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

export function PlotMeasurementsDialog({
  open,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PlotMeasurementsDialogValues) => void;
}) {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");
  const [mode, setMode] = useState<"combined" | "per-series">("combined");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="plot-measurements-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Plot measurements</DialogTitle>
          <DialogDescription>
            Extract cited numeric measurements from this report&apos;s
            attachments and save a scatter plot in Results. Use a requirement
            ID or measurement name, for example M3-SYS-FN-037.
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
              placeholder="M3-SYS-FN-037"
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
              })
            }
          >
            {submitting ? "Extracting…" : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
