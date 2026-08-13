"use client";

import { Check, Loader2, X } from "lucide-react";
import { captureEvent } from "@/lib/analytics/events";

export function SuggestionInlineActions({
  suggestionId,
  pending = false,
  revising = false,
  disabled = false,
  acceptDisabled,
  dismissDisabled,
  onAccept,
  onDismiss,
}: {
  suggestionId: string;
  pending?: boolean;
  revising?: boolean;
  disabled?: boolean;
  acceptDisabled?: boolean;
  dismissDisabled?: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const acceptBusy = pending || revising || (acceptDisabled ?? disabled);
  const dismissBusy = pending || revising || (dismissDisabled ?? disabled);
  const acceptTitle = revising
    ? "Revising…"
    : pending
      ? "Applying suggestion"
      : "Accept suggestion";
  const dismissTitle = revising ? "Revising…" : "Ignore suggestion";

  return (
    <span
      className="suggestion-action-widget"
      contentEditable={false}
      data-eval-id={suggestionId}
    >
      <button
        type="button"
        className="suggestion-action-button suggestion-action-button-accept"
        title={acceptTitle}
        aria-label={acceptTitle}
        disabled={acceptBusy}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!acceptBusy) {
            captureEvent("ai_suggestion_accepted", { suggestionId });
            onAccept();
          }
        }}
      >
        {pending || revising ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
      </button>
      <span className="suggestion-action-divider" aria-hidden />
      <button
        type="button"
        className="suggestion-action-button suggestion-action-button-ignore"
        title={dismissTitle}
        aria-label={dismissTitle}
        disabled={dismissBusy}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dismissBusy) {
            captureEvent("ai_suggestion_dismissed", { suggestionId });
            onDismiss();
          }
        }}
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
