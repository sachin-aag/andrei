"use client";

import type { CSSProperties } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  useReportComments,
  useReportEvaluations,
} from "@/providers/report-provider";
import {
  openIdentitySuggestion,
  proposedIdentityValue,
} from "@/lib/suggestions/identity-suggestion";

export function useIdentitySavePaused(): boolean {
  const { comments } = useReportComments();
  const { suggestionApplyTransition } = useReportEvaluations();
  return (
    Boolean(suggestionApplyTransition.identity) ||
    openIdentitySuggestion(comments) != null
  );
}

export function IdentitySuggestionField({
  id,
  label,
  value,
  disabled,
  onChange,
  fieldKey,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  fieldKey: string;
}) {
  const { comments } = useReportComments();
  const proposed = proposedIdentityValue(comments, fieldKey);
  const showOverlay = proposed !== undefined && proposed !== value;

  return (
    <div className="grid gap-1.5" data-field-anchor={`identity.${fieldKey}`}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={
            showOverlay
              ? "text-transparent caret-foreground selection:bg-primary/20 selection:text-transparent"
              : undefined
          }
          style={
            showOverlay
              ? ({ WebkitTextFillColor: "transparent" } as CSSProperties)
              : undefined
          }
        />
        {showOverlay ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 text-sm whitespace-nowrap"
          >
            <span className="suggestion-insert suggestion-insert-ai">
              {proposed}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
