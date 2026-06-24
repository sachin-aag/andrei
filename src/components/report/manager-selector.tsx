"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

type ManagerOption = Pick<WorkspaceUser, "id" | "name" | "title">;

function managerLabel(manager: ManagerOption): string {
  return manager.title ? `${manager.name} — ${manager.title}` : manager.name;
}

export function ManagerSelector({
  managers,
  selectedIds,
  disabled = false,
  onSelectedIdsChange,
  emptyMessage = "No managers are available.",
  placeholder = "Select reviewer managers…",
}: {
  managers: ManagerOption[];
  selectedIds: string[];
  disabled?: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  emptyMessage?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedManagers = managers.filter((manager) =>
    selected.has(manager.id)
  );

  const filteredManagers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return managers;
    return managers.filter((manager) => {
      const haystack = `${manager.name} ${manager.title ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [managers, query]);

  const toggleManager = (managerId: string) => {
    if (selected.has(managerId)) {
      onSelectedIdsChange(selectedIds.filter((id) => id !== managerId));
      return;
    }

    onSelectedIdsChange(
      managers
        .map((manager) => manager.id)
        .filter((id) => id === managerId || selected.has(id))
    );
  };

  const removeManager = (managerId: string) => {
    onSelectedIdsChange(selectedIds.filter((id) => id !== managerId));
  };

  if (managers.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between gap-2 px-3 py-2 font-normal"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-left">
            {selectedManagers.length === 0 ? (
              <span className="text-[var(--muted-foreground)]">{placeholder}</span>
            ) : (
              selectedManagers.map((manager) => (
                <span
                  key={manager.id}
                  className="inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--secondary)] px-2 py-0.5 text-xs"
                >
                  <span className="truncate">{manager.name}</span>
                  {!disabled && (
                    <button
                      type="button"
                      className="rounded-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      aria-label={`Remove ${manager.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeManager(manager.id);
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="border-b border-[var(--border)] p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search managers…"
              className="h-8 pl-8"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="max-h-56">
          <div className="p-1">
            {filteredManagers.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-[var(--muted-foreground)]">
                No managers match your search.
              </p>
            ) : (
              filteredManagers.map((manager) => {
                const checked = selected.has(manager.id);
                return (
                  <button
                    key={manager.id}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-[var(--accent)]",
                      checked && "bg-[var(--accent)]/60"
                    )}
                    onClick={() => toggleManager(manager.id)}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border border-[var(--border)]",
                        checked && "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                      )}
                    >
                      {checked ? <Check className="size-3" /> : null}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="font-medium">{manager.name}</span>
                      {manager.title ? (
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {manager.title}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
        {selectedManagers.length > 0 ? (
          <div className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
            {selectedManagers.length} selected
            <span className="sr-only">: {selectedManagers.map(managerLabel).join(", ")}</span>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
