"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SaveStatus } from "../save-status";
import {
  SectionRunEvaluationButton,
  SectionStatusPill,
} from "../section-status-pill";
import type { SaveStatus as SaveStatusType } from "@/hooks/use-auto-save";
import type { SectionType } from "@/db/schema";

export function SectionShell({
  title,
  description,
  status,
  lastSavedAt,
  children,
  showSaveStatus = true,
  section,
}: {
  title: string;
  description?: string;
  status?: SaveStatusType;
  lastSavedAt?: Date | null;
  children: ReactNode;
  showSaveStatus?: boolean;
  section?: SectionType;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-[var(--muted-foreground)] mt-1 max-w-2xl">
              {description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 ml-auto">
          {showSaveStatus && status !== undefined && (
            <SaveStatus status={status} lastSavedAt={lastSavedAt ?? null} />
          )}
        </div>
      </div>
      {section && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-md flex-1">
            <SectionStatusPill section={section} />
          </div>
          <SectionRunEvaluationButton section={section} />
        </div>
      )}
      <Card>
        <CardContent className="p-5 space-y-5">{children}</CardContent>
      </Card>
    </div>
  );
}

