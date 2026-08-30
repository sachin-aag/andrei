"use client";

import { ChevronDown } from "lucide-react";

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
  onAddDataSheet,
  onRenameDataSheet,
}: {
  readOnly: boolean;
  onLoadSample: () => void;
  onNormalSixpack: () => void;
  onOneWayAnova: () => void;
  onXyScatter: () => void;
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
            Plot measurements…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
