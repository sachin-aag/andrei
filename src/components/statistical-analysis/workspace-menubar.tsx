"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceMenubar({
  onRename,
  onDelete,
  onClose,
  onInsertColumn,
  onDeleteColumn,
  onInsertRow,
  onDeleteRow,
  onLoadSample,
  onNormalSixpack,
}: {
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
  onInsertColumn: () => void;
  onDeleteColumn: () => void;
  onInsertRow: () => void;
  onDeleteRow: () => void;
  onLoadSample: () => void;
  onNormalSixpack: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            File
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={onRename}>Rename worksheet…</DropdownMenuItem>
          <DropdownMenuItem onSelect={onDelete}>Delete worksheet</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onClose}>Close</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
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
            data-testid="load-sample-assay"
            onSelect={onLoadSample}
          >
            Load sample assay
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            Stat
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Quality Tools</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Capability Sixpack</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    data-testid="stat-normal-sixpack"
                    onSelect={onNormalSixpack}
                  >
                    Normal…
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
