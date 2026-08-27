"use client";

import { CheckCheck, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shouldShowSuggestionBulkActions } from "@/lib/suggestions/bulk-suggestions";

export function SuggestionBulkActions({
  queueTotal,
  pending,
  canResolve,
  resolveHint,
  onAcceptAll,
  onDismissAll,
}: {
  queueTotal: number;
  pending: boolean;
  canResolve: boolean;
  resolveHint: string;
  onAcceptAll: () => void;
  onDismissAll: () => void;
}) {
  if (!shouldShowSuggestionBulkActions(queueTotal)) return null;

  const disabled = pending || !canResolve;

  return (
    <div
      className="flex flex-wrap gap-2"
      data-testid="suggestion-bulk-actions"
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={disabled}
        title={!canResolve ? resolveHint : "Apply every remaining suggestion in this section"}
        onClick={onAcceptAll}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <CheckCheck className="size-3" />
        )}
        Apply all
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        disabled={disabled}
        title={!canResolve ? resolveHint : "Dismiss every remaining suggestion in this section"}
        onClick={onDismissAll}
      >
        <X className="size-3" />
        Dismiss all
      </Button>
    </div>
  );
}
