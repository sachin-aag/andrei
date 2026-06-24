"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

type ManagerOption = Pick<WorkspaceUser, "id" | "name" | "title">;

export function ManagerSelector({
  managers,
  selectedIds,
  disabled = false,
  onSelectedIdsChange,
  emptyMessage = "No managers are available.",
}: {
  managers: ManagerOption[];
  selectedIds: string[];
  disabled?: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  emptyMessage?: string;
}) {
  const selected = new Set(selectedIds);

  const toggleManager = (managerId: string, checked: boolean) => {
    if (checked) {
      onSelectedIdsChange(
        managers
          .map((manager) => manager.id)
          .filter((id) => id === managerId || selected.has(id))
      );
      return;
    }

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
    <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--input)] p-3">
      {managers.map((manager) => {
        const checked = selected.has(manager.id);
        return (
          <label
            key={manager.id}
            className="flex cursor-pointer items-start gap-3 rounded-sm px-1 py-1.5 text-sm"
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(value) => toggleManager(manager.id, value === true)}
              aria-label={`Assign ${manager.name} as a reviewer`}
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{manager.name}</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {manager.title}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
