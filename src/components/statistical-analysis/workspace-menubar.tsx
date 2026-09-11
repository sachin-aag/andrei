"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WORKSHEET_PLOT_CATALOG,
  type WorksheetPlotKind,
} from "@/lib/statistical-analysis/plot-catalog";

export function WorkspaceMenubar({
  readOnly,
  onLoadSample,
  onSelectPlot,
  onAddDataSheet,
  onRenameDataSheet,
}: {
  readOnly: boolean;
  onLoadSample: () => void;
  onSelectPlot: (kind: WorksheetPlotKind) => void;
  onAddDataSheet: () => void;
  onRenameDataSheet: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            data-testid="worksheet-data-menu"
            className="gap-1 pr-2 data-[state=open]:bg-[var(--secondary)]"
          >
            Data
            <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
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
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            data-testid="worksheet-plot-menu"
            className="gap-1 pr-2 data-[state=open]:bg-[var(--secondary)]"
          >
            Plot
            <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {WORKSHEET_PLOT_CATALOG.map((item) => (
            <DropdownMenuItem
              key={item.kind}
              data-testid={item.menuTestId}
              onSelect={() => onSelectPlot(item.kind)}
            >
              {item.label}…
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
