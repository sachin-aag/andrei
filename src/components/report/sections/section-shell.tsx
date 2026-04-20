"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SaveStatus } from "../save-status";
import type { SaveStatus as SaveStatusType } from "@/hooks/use-auto-save";

export function SectionShell({
  title,
  description,
  status,
  lastSavedAt,
  children,
  showSaveStatus = true,
}: {
  title: string;
  description?: string;
  status?: SaveStatusType;
  lastSavedAt?: Date | null;
  children: ReactNode;
  showSaveStatus?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-[var(--muted-foreground)] mt-1 max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {showSaveStatus && status !== undefined && (
          <SaveStatus status={status} lastSavedAt={lastSavedAt ?? null} />
        )}
      </div>
      <Card>
        <CardContent className="p-5 space-y-5">{children}</CardContent>
      </Card>
    </div>
  );
}

export function CriteriaChecklist({
  items,
}: {
  items: string[];
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-4 text-xs text-[var(--muted-foreground)]">
      <div className="font-semibold text-[var(--foreground)] mb-2 text-xs uppercase tracking-wide">
        Checks to consider
      </div>
      <ul className="space-y-1 list-disc list-inside">
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
