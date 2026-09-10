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
import { FieldInfoIcon } from "@/components/statistical-analysis/field-info";
import type { WorksheetSpecRow } from "@/lib/statistical-analysis/types";

const fieldLabelClass =
  "normal-case tracking-normal text-sm font-medium text-[var(--foreground)]";

export type ColumnSpecsDialogValues = {
  lsl: string;
  usl: string;
  target: string;
};

export function ColumnSpecsDialog({
  open,
  columnName,
  spec,
  readOnly,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  columnName: string;
  spec: WorksheetSpecRow | undefined;
  readOnly: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: ColumnSpecsDialogValues) => void;
}) {
  const [lsl, setLsl] = useState(spec?.lsl ?? "");
  const [usl, setUsl] = useState(spec?.usl ?? "");
  const [target, setTarget] = useState(spec?.target ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="column-specs-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Specs for {columnName}</DialogTitle>
          <DialogDescription>
            Spec limits for this column.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="column-spec-lsl" className={fieldLabelClass}>
                LSL
              </Label>
              <FieldInfoIcon
                label="LSL"
                testId="column-spec-lsl-info"
                text="Extraction fills these when attachments name LSL/USL. Sixpack uses them first, then min and max of the selected data."
              />
            </div>
            <Input
              id="column-spec-lsl"
              data-testid="column-spec-lsl"
              inputMode="decimal"
              value={lsl}
              disabled={readOnly}
              onChange={(event) => setLsl(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="column-spec-target" className={fieldLabelClass}>
              Target
            </Label>
            <Input
              id="column-spec-target"
              data-testid="column-spec-target"
              inputMode="decimal"
              value={target}
              disabled={readOnly}
              onChange={(event) => setTarget(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="column-spec-usl" className={fieldLabelClass}>
              USL
            </Label>
            <Input
              id="column-spec-usl"
              data-testid="column-spec-usl"
              inputMode="decimal"
              value={usl}
              disabled={readOnly}
              onChange={(event) => setUsl(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          {readOnly ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                data-testid="column-specs-save"
                onClick={() => onSave({ lsl, usl, target })}
              >
                Save
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
