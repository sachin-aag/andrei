"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceMenubar({
  readOnly,
  onLoadSample,
  onNormalSixpack,
  onOneWayAnova,
  onXyScatter,
  onPlotMeasurements,
  onAddDataSheet,
  onRenameDataSheet,
}: {
  readOnly: boolean;
  onLoadSample: () => void;
  onNormalSixpack: () => void;
  onOneWayAnova: () => void;
  onXyScatter: () => void;
  onPlotMeasurements: () => void;
  onAddDataSheet: () => void;
  onRenameDataSheet: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={readOnly}
            data-testid="worksheet-data-menu"
          >
            Data
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            data-testid="add-data-sheet"
            onSelect={onAddDataSheet}
          >
            New data sheet
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="rename-data-sheet"
            onSelect={onRenameDataSheet}
          >
            Rename data sheet
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="load-sample-assay"
            onSelect={onLoadSample}
          >
            Load sample assay
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={readOnly}
            data-testid="worksheet-stat-menu"
          >
            Stat
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            data-testid="stat-normal-sixpack"
            onSelect={onNormalSixpack}
          >
            Normal Capability Sixpack…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="stat-one-way-anova"
            onSelect={onOneWayAnova}
          >
            One-Way ANOVA…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="stat-xy-scatter"
            onSelect={onXyScatter}
          >
            Scatter…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="stat-plot-measurements"
            onSelect={onPlotMeasurements}
          >
            Plot measurements…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
