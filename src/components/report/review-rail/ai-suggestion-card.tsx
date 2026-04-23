"use client";

import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApplySuggestion } from "@/hooks/use-apply-suggestion";
import { useReport } from "@/providers/report-provider";
import { cn } from "@/lib/utils";
import { SECTION_LABELS } from "@/types/sections";
import type { EvaluationRecord } from "@/types/report";

const STATUS_BADGE = {
  partially_met: { label: "Partial", cls: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  not_met: { label: "Issue", cls: "bg-red-100 text-red-800 border-red-300" },
  met: { label: "Met", cls: "bg-green-100 text-green-800 border-green-300" },
  not_evaluated: {
    label: "Pending",
    cls: "bg-[var(--secondary)] text-[var(--muted-foreground)] border-[var(--border)]",
  },
} as const;

export function AiSuggestionCard({
  evaluation,
  active,
  anchorMissing,
  onActivate,
}: {
  evaluation: EvaluationRecord;
  active: boolean;
  anchorMissing: boolean;
  onActivate: () => void;
}) {
  const { readOnly, trackChangesMode } = useReport();
  const { applySuggestion, ignoreSuggestion, pendingId } = useApplySuggestion();
  const fix = evaluation.suggestedFix;
  const pending = pendingId === evaluation.id;
  const badge = STATUS_BADGE[evaluation.status] ?? STATUS_BADGE.not_evaluated;

  const canAct = !readOnly;
  const showAnchor = !!fix?.anchorText?.trim();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "rounded-md border bg-[var(--card)] shadow-sm text-left transition-all overflow-hidden cursor-pointer",
        active
          ? "border-[var(--brand-600)] ring-2 ring-[var(--brand-600)]/30"
          : "border-[var(--border)] hover:border-[var(--brand-500)]/60"
      )}
    >
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-2 bg-[var(--brand-50)]">
        <Sparkles className="size-3.5 text-[var(--brand-700)] shrink-0" />
        <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--brand-700)]">
          AI suggestion
        </span>
        <span
          className={cn(
            "ml-auto text-[10px] px-1.5 py-0.5 rounded border font-medium",
            badge.cls
          )}
        >
          {badge.label}
        </span>
      </div>

      <div className="p-3 space-y-2">
        <div className="text-xs font-semibold text-[var(--foreground)]">
          {evaluation.criterionLabel}
        </div>
        <div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide">
          {SECTION_LABELS[evaluation.section] ?? evaluation.section}
        </div>

        {evaluation.reasoning && (
          <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
            {evaluation.reasoning}
          </p>
        )}

        {fix?.replacementText?.trim() && (
          <div className="rounded border border-[var(--border)] bg-[var(--secondary)]/40 divide-y divide-[var(--border)]">
            {showAnchor && (
              <div className="p-2">
                <div className="text-[9px] uppercase tracking-wide font-medium text-[var(--muted-foreground)] mb-0.5">
                  Replace
                </div>
                <div className="text-[11px] line-through text-red-700/90 leading-snug whitespace-pre-wrap">
                  {fix.anchorText.trim().length > 220
                    ? `${fix.anchorText.trim().slice(0, 220)}…`
                    : fix.anchorText.trim()}
                </div>
              </div>
            )}
            <div className="p-2">
              <div className="text-[9px] uppercase tracking-wide font-medium text-[var(--muted-foreground)] mb-0.5">
                {showAnchor ? "With" : "Append"}
              </div>
              <div className="text-[11px] text-green-800 leading-snug whitespace-pre-wrap">
                {fix.replacementText}
              </div>
            </div>
          </div>
        )}

        {anchorMissing && (
          <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Original text not found — re-run AI check or apply will append.
          </div>
        )}

        {canAct && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <Button
              type="button"
              size="sm"
              variant="success"
              className="h-7 text-xs"
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                void applySuggestion(evaluation);
              }}
            >
              {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                void ignoreSuggestion(evaluation);
              }}
            >
              <X className="size-3" />
              Ignore
            </Button>
            {trackChangesMode && (
              <span className="ml-auto text-[9px] uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                Tracked
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
