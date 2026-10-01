"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  useReportComments,
  useReportEvaluations,
} from "@/providers/report-provider";
import {
  identityFieldPreviewSegments,
  openIdentitySuggestion,
  proposedIdentityValue,
} from "@/lib/suggestions/identity-suggestion";
import type { PlainTextPreviewSegment } from "@/lib/suggestions/plain-text-preview";

export function useIdentitySavePaused(): boolean {
  const { comments } = useReportComments();
  const { suggestionApplyTransition } = useReportEvaluations();
  return (
    Boolean(suggestionApplyTransition.identity) ||
    openIdentitySuggestion(comments) != null
  );
}

function PreviewRun({
  segment,
}: {
  segment: PlainTextPreviewSegment;
}) {
  if (segment.kind === "delete") {
    return (
      <span className="suggestion-delete suggestion-delete-ai">
        {segment.text}
      </span>
    );
  }
  if (segment.kind === "insert") {
    return (
      <span className="suggestion-insert suggestion-insert-ai">
        {segment.text}
      </span>
    );
  }
  return <span>{segment.text}</span>;
}

export function IdentitySuggestionField({
  id,
  label,
  value,
  disabled,
  placeholder,
  onChange,
  fieldKey,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
  fieldKey: string;
  type?: "text" | "date";
}) {
  const { comments } = useReportComments();
  const proposed = proposedIdentityValue(comments, fieldKey);
  const segments = identityFieldPreviewSegments(value, proposed);
  const showOverlay = type === "text" && segments != null;
  const showDateChip = type === "date" && proposed !== undefined && proposed !== value;

  return (
    <div className="grid gap-1.5" data-field-anchor={`identity.${fieldKey}`}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={showOverlay ? "text-transparent caret-foreground" : undefined}
        />
        {showOverlay ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 text-sm whitespace-nowrap"
          >
            {segments.map((segment, index) => (
              <PreviewRun key={`${segment.kind}-${index}`} segment={segment} />
            ))}
          </div>
        ) : null}
      </div>
      {showDateChip ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Proposed{" "}
          <span className="suggestion-insert suggestion-insert-ai">{proposed}</span>
        </p>
      ) : null}
    </div>
  );
}
