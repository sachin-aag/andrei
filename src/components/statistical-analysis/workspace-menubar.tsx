"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceMenubar({
  readOnly,
  onInsertColumn,
  onDeleteColumn,
  onInsertRow,
  onDeleteRow,
  onLoadSample,
  onNormalSixpack,
  onPlotMeasurements,
  onAddDataSheet,
}: {
  readOnly: boolean;
  onInsertColumn: () => void;
  onDeleteColumn: () => void;
  onInsertRow: () => void;
  onDeleteRow: () => void;
  onLoadSample: () => void;
  onNormalSixpack: () => void;
  onPlotMeasurements: () => void;
  onAddDataSheet: () => void;
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
          <DropdownMenuItem onSelect={onInsertColumn}>Insert column</DropdownMenuItem>
          <DropdownMenuItem onSelect={onDeleteColumn}>Delete column</DropdownMenuItem>
          <DropdownMenuItem onSelect={onInsertRow}>Insert row</DropdownMenuItem>
          <DropdownMenuItem onSelect={onDeleteRow}>Delete row</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="add-data-sheet"
            onSelect={onAddDataSheet}
          >
            New data sheet
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
          <Button variant="ghost" size="sm" disabled={readOnly}>
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
