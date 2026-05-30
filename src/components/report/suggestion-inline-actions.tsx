"use client";

import { Check, Loader2, X } from "lucide-react";

export function SuggestionInlineActions({
  suggestionId,
  pending = false,
  disabled = false,
  acceptDisabled,
  dismissDisabled,
  onAccept,
  onDismiss,
}: {
  suggestionId: string;
  pending?: boolean;
  disabled?: boolean;
  acceptDisabled?: boolean;
  dismissDisabled?: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const acceptBusy = pending || (acceptDisabled ?? disabled);
  const dismissBusy = pending || (dismissDisabled ?? disabled);

  return (
    <span
      className="suggestion-action-widget"
      contentEditable={false}
      data-eval-id={suggestionId}
    >
      <button
        type="button"
        className="suggestion-action-button suggestion-action-button-accept"
        title={pending ? "Applying suggestion" : "Accept suggestion"}
        aria-label={pending ? "Applying suggestion" : "Accept suggestion"}
        disabled={acceptBusy}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!acceptBusy) onAccept();
        }}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
      </button>
      <span className="suggestion-action-divider" aria-hidden />
      <button
        type="button"
        className="suggestion-action-button suggestion-action-button-ignore"
        title="Ignore suggestion"
        aria-label="Ignore suggestion"
        disabled={dismissBusy}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dismissBusy) onDismiss();
        }}
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
