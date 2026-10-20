"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Crosshair } from "lucide-react";
import type { MouseEvent } from "react";
import {
  REVIEW_SEVERITY_LABEL,
  coerceReviewSeverity,
  type ReviewSeverity,
} from "@/lib/review/severity";
import type {
  ReviewCardPrimaryAction,
  ReviewCardSuggestion,
  ReviewFindingCardModel,
} from "@/lib/review/finding-card";

const SEVERITY_BADGE: Record<ReviewSeverity, string> = {
  critical: "bg-red-50 text-red-700",
  major: "bg-amber-50 text-amber-800",
  minor: "bg-sky-50 text-sky-800",
};

const SEVERITY_ACCENT: Record<ReviewSeverity, string> = {
  critical: "border-l-red-500",
  major: "border-l-amber-500",
  minor: "border-l-sky-500",
};

const PRIMARY_LABEL: Record<ReviewCardPrimaryAction, string> = {
  apply: "Apply as tracked change",
  view: "View tracked change",
  none: "Apply as tracked change",
};

export const NO_SUGGESTION_HINT =
  "No suggestion was automatically available. Human review is needed.";

const NO_PLACE_HINT = "This finding is about the whole document, not one place in it.";

/** Apply and Show in document share one width so the row reads the same on every card. */
const ACTION_WIDTH = "w-44";

function busyLabel(card: ReviewFindingCardModel): string {
  return card.suggestion.kind === "draft_on_apply" ? "Drafting…" : "Applying…";
}

const BOX_TONE = {
  fix: "border-emerald-200/80 bg-emerald-50",
  ai: "border-violet-200/80 bg-violet-50",
  manual: "border-slate-200 bg-slate-50",
} as const;

const LABEL_TONE = {
  fix: "text-emerald-800",
  ai: "text-violet-800",
  manual: "text-slate-600",
} as const;

function suggestionCopy(suggestion: ReviewCardSuggestion): {
  tone: keyof typeof BOX_TONE;
  label: string;
  text: string;
  struck?: boolean;
  note?: string;
} {
  switch (suggestion.kind) {
    case "replacement":
      if (suggestion.insertText && suggestion.deleteText) {
        return { tone: "fix", label: "Suggested replacement", text: suggestion.insertText };
      }
      if (suggestion.insertText) {
        return { tone: "fix", label: "Suggested insertion", text: suggestion.insertText };
      }
      return {
        tone: "fix",
        label: "Suggested deletion",
        text: suggestion.deleteText,
        struck: true,
      };
    case "multi_part":
      return {
        tone: "fix",
        label: "Suggested change",
        text: "Edits more than one place. The changes show as tracked changes in the document.",
      };
    case "draft_on_apply":
      return {
        tone: "ai",
        label: "AI fix",
        text: "Drafted from the criterion when you apply it.",
      };
    case "none":
      return suggestion.suggestedText
        ? {
            tone: "manual",
            label: "Suggested wording",
            text: suggestion.suggestedText,
            note: "It could not be matched to the text, so make this edit by hand.",
          }
        : {
            tone: "manual",
            label: "Needs your review",
            text: NO_SUGGESTION_HINT,
          };
  }
}

function SuggestionBox({
  suggestion,
  inDocument,
}: {
  suggestion: ReviewCardSuggestion;
  inDocument: boolean;
}) {
  const copy = suggestionCopy(suggestion);
  return (
    <div
      className={cn("mt-3 rounded-md border px-3 py-2", BOX_TONE[copy.tone])}
      data-testid="review-finding-suggestion"
      data-suggestion-kind={suggestion.kind}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide",
            LABEL_TONE[copy.tone]
          )}
        >
          {copy.label}
        </p>
        {inDocument ? (
          <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
            In document
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 text-sm leading-snug text-[var(--foreground)]",
          copy.tone === "manual" && !copy.note && "text-xs text-[var(--muted-foreground)]",
          copy.struck && "line-through decoration-red-500/70"
        )}
      >
        {copy.text}
      </p>
      {copy.note ? (
        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{copy.note}</p>
      ) : null}
    </div>
  );
}

function fromButton(event: MouseEvent): boolean {
  return (event.target as HTMLElement).closest("button, a, [role='button']") != null;
}

export function ReviewFindingCard({
  severity,
  card,
  located,
  busy,
  locateHint,
  onShowInDocument,
  onPrimary,
  onDismiss,
}: {
  severity: string;
  card: ReviewFindingCardModel;
  located?: boolean;
  busy?: boolean;
  /** Shown while this card's highlight is active and it is not exact text. */
  locateHint?: string | null;
  /** Omitted when the finding is not tied to a section. */
  onShowInDocument?: () => void;
  /** Omitted when the viewer cannot edit or no suggestion was prepared. */
  onPrimary?: () => void;
  onDismiss?: () => void;
}) {
  const level = coerceReviewSeverity(severity);
  return (
    <article
      className={cn(
        "rounded-lg border border-[var(--border)] border-l-4 bg-[var(--card)] px-3.5 py-3 transition-shadow",
        SEVERITY_ACCENT[level],
        onShowInDocument && "cursor-pointer hover:shadow-sm",
        located && "ring-2 ring-yellow-300/80"
      )}
      data-testid="review-finding-card"
      data-located={located ? "true" : undefined}
      onClick={(event) => {
        if (!onShowInDocument || fromButton(event)) return;
        onShowInDocument();
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            SEVERITY_BADGE[level]
          )}
        >
          {REVIEW_SEVERITY_LABEL[level]}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium leading-snug text-[var(--muted-foreground)]">
            {card.location}
          </p>
          {card.kicker ? (
            <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">
              {card.kicker}
            </p>
          ) : null}
        </div>
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug text-[var(--foreground)]">
        {card.title}
      </h3>
      {card.body ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
          {card.body}
        </p>
      ) : null}
      <SuggestionBox
        suggestion={card.suggestion}
        inDocument={card.primary === "view"}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex"
          title={card.primary === "none" ? NO_SUGGESTION_HINT : undefined}
          data-testid="review-finding-primary"
        >
          <Button
            type="button"
            size="sm"
            variant="success"
            className={ACTION_WIDTH}
            onClick={onPrimary}
            disabled={busy || !onPrimary}
          >
            {busy ? busyLabel(card) : PRIMARY_LABEL[card.primary]}
          </Button>
        </span>
        <span
          className="inline-flex"
          title={onShowInDocument ? undefined : NO_PLACE_HINT}
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(ACTION_WIDTH, "gap-1.5 bg-[var(--card)]")}
            onClick={onShowInDocument}
            disabled={!onShowInDocument}
          >
            <Crosshair className="size-3.5" aria-hidden="true" />
            Show in document
          </Button>
        </span>
        {onDismiss ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-[var(--muted-foreground)]"
            onClick={onDismiss}
            disabled={busy}
          >
            Dismiss
          </Button>
        ) : null}
      </div>
      {located && locateHint ? (
        <p
          className="mt-2 text-[11px] leading-snug text-amber-800"
          data-testid="review-finding-locate-hint"
        >
          {locateHint}
        </p>
      ) : null}
    </article>
  );
}
