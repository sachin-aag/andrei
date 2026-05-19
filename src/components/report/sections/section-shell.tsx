"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SaveStatus } from "../save-status";
import {
  SectionRunEvaluationButton,
  SectionStatusPill,
  SectionSuggestFixesButton,
} from "../section-status-pill";
import { SectionSuggestionCard } from "../suggestion-card";
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
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-md flex-1">
              <SectionStatusPill section={section} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SectionRunEvaluationButton section={section} />
              <SectionSuggestFixesButton section={section} />
            </div>
          </div>
        </div>
      )}
      {section && (
        <div className="lg:hidden">
          <SectionSuggestionCard section={section} />
        </div>
      )}
      <Card>
        <CardContent className="p-5 space-y-5">{children}</CardContent>
      </Card>
    </div>
  );
}

export function CriteriaChecklist({
  items,
  ordered = false,
}: {
  items: string[];
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <details className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-4 text-xs text-[var(--muted-foreground)]">
      <summary className="cursor-pointer font-semibold text-[var(--foreground)] text-xs uppercase tracking-wide">
        Checks to consider
      </summary>
      <List className={`mt-2 space-y-1 ${ordered ? "list-decimal" : "list-disc"} list-outside pl-4`}>
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </List>
    </details>
  );
}
