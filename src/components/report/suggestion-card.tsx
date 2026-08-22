"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ArrowDown, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useReportComments,
  useReportData,
  useReportEvaluations,
  useReportSections,
} from "@/providers/report-provider";
import { useUserDirectory } from "@/providers/user-directory-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  STATUS_COLOR,
  STATUS_TEXT_COLOR,
  effectiveStatus,
} from "@/lib/ai/criteria-view";
import {
  parseAiFixCommentContent,
  parseAiRedraftCommentContent,
  sortedOpenSuggestionsForSection,
  type ParsedAiFixPayload,
  type ParsedAiRedraftPayload,
} from "@/lib/ai/suggestion-gating";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { splitPlainTextWithPlaceholders } from "@/lib/placeholders/plain-text-segments";
import { inlineMarkdownToTextNodes } from "@/lib/tiptap/markdown-to-doc";
import {
  afterPaint,
  delay,
  SUGGESTION_APPLY_SETTLE_MS,
  SUGGESTION_CARD_ENTER_MS,
  SUGGESTION_CARD_EXIT_MS,
  SUGGESTION_INLINE_REVEAL_DELAY_MS,
  SUGGESTION_NEXT_PREVIEW_DELAY_MS,
  waitForAnimation,
} from "@/lib/suggestions/apply-transition";
import {
  acceptSuggestion,
  dismissSuggestion,
  CommentPersistError,
  SectionPersistError,
} from "@/lib/suggestions/accept-suggestion";
import {
  isSuggestionTargetInViewport,
  measureSuggestionGutterParkCenterY,
  scrollToSuggestionComment,
} from "@/lib/suggestions/navigate-suggestion";
import {
  countStaleOpenSuggestions,
  suggestionStaleMessage,
  validateSuggestionLocate,
  type SuggestionValidation,
} from "@/lib/suggestions/validate-suggestion";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";
type CardPhase =
  | "steady"
  | "applying"
  | "applied"
  | "preparing-next";
type QueueTransition = null | "exit" | "enter";
type QueueAdvanceOutcome = "bridge" | "advanced";

const LOCATABLE_VALIDATION: SuggestionValidation = {
  locateStatus: "locatable",
  documentChanged: false,
  canApply: true,
  canPreview: true,
};

type FrozenCardBase = {
  comment: CommentRecord;
  linkedEval: EvaluationRecord | undefined;
  queueIndex: number;
  queueTotal: number;
};

type FrozenCard = FrozenCardBase &
  (
    | { kind: "fix"; payload: ParsedAiFixPayload; normalizedInsert: string }
    | { kind: "redraft"; redraft: ParsedAiRedraftPayload }
  );

function buildFrozenCard(
  comment: CommentRecord,
  evaluations: EvaluationRecord[],
  queueIndex: number,
  queueTotal: number
): FrozenCard {
  const base: FrozenCardBase = {
    comment,
    linkedEval: comment.evaluationId
      ? evaluations.find((e) => e.id === comment.evaluationId)
      : undefined,
    queueIndex,
    queueTotal,
  };
  if (comment.kind === "ai_redraft") {
    return { ...base, kind: "redraft", redraft: parseAiRedraftCommentContent(comment.content) };
  }
  const payload = parseAiFixCommentContent(comment.content);
  return {
    ...base,
    kind: "fix",
    payload,
    normalizedInsert: normalizeSuggestionInsertText(payload.insertText),
  };
}

function InlineMarkdownSpan({ text }: { text: string }) {
  return (
    <>
      {inlineMarkdownToTextNodes(text).map((node, i) => {
        const marks = node.marks ?? [];
        const italic = marks.some((m) => m.type === "italic");
        const bold = marks.some((m) => m.type === "bold");
        return (
          <span
            key={i}
            className={
              italic && bold
                ? "italic font-semibold"
                : italic
                  ? "italic"
                  : bold
                    ? "font-semibold"
                    : undefined
            }
          >
            {node.text}
          </span>
        );
      })}
    </>
  );
}

/** Text with actionable `[placeholder]` spans highlighted (citations stay plain). */
function PlaceholderHighlightedText({ text }: { text: string }) {
  return (
    <>
      {splitPlainTextWithPlaceholders(text).map((part, i) =>
        part.kind === "placeholder" ? (
          <span key={i} className="suggestion-preview-placeholder">
            {part.text}
          </span>
        ) : (
          <InlineMarkdownSpan key={i} text={part.text} />
        )
      )}
    </>
  );
}

const RESOLVE_HINT =
  "Only the report author or a manager can act on suggestions.";

function SuggestionCardFace({
  card,
  phase,
  showActions,
  pending,
  validation,
  queueStaleHint,
  canResolve,
  onAccept,
  onDismiss,
}: {
  card: FrozenCard;
  phase: CardPhase;
  showActions: boolean;
  pending: boolean;
  validation: SuggestionValidation;
  queueStaleHint: string | null;
  canResolve: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { linkedEval, queueIndex, queueTotal } = card;
  const eff = linkedEval ? effectiveStatus(linkedEval) : "not_evaluated";
  const reasoning = card.kind === "fix" ? card.payload.reasoning : card.redraft.reasoning;
  const evidenceSources =
    card.kind === "fix" ? (card.payload.evidenceSources ?? []) : [];

  const statusLine =
    phase === "applying"
      ? queueTotal > 1
        ? "Applying this change to the document…"
        : "Applying to document…"
      : phase === "applied"
        ? "Change applied — review the updated text"
        : phase === "preparing-next"
          ? `Preparing suggestion ${Math.min(queueIndex + 1, queueTotal)} of ${queueTotal}…`
          : null;

  return (
    <div
      className={cn(
        "rounded-md border border-violet-500/30 bg-[var(--card)] p-3 space-y-2",
        phase === "applied" && "suggestion-card-applied-glow"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          phase !== "steady" && "opacity-85"
        )}
      >
        <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wide">
          {card.kind === "redraft" ? "Full draft" : "Suggestion"} {queueIndex} of {queueTotal}
        </span>
        {linkedEval && (
          <span
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1",
              STATUS_TEXT_COLOR[eff]
            )}
          >
            <span className={cn("size-1.5 rounded-full shrink-0", STATUS_COLOR[eff])} />
            {linkedEval.criterionLabel}
          </span>
        )}
      </div>

      {statusLine ? (
        <p className="text-[11px] suggestion-preview-insert font-medium flex items-center gap-1.5 px-1 py-0.5">
          {phase === "applying" ? (
            <Loader2 className="size-3 animate-spin shrink-0" />
          ) : (
            <Check className="size-3 shrink-0" />
          )}
          {statusLine}
        </p>
      ) : null}

      {phase === "steady" && !validation.canApply ? (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200/80 rounded px-2 py-1.5 leading-snug">
          {suggestionStaleMessage(validation)}
        </p>
      ) : null}

      {phase === "steady" && queueStaleHint ? (
        <p className="text-[10px] text-[var(--muted-foreground)]">{queueStaleHint}</p>
      ) : null}

      {phase === "steady" && !canResolve ? (
        <p className="text-[10px] text-[var(--muted-foreground)]">{RESOLVE_HINT}</p>
      ) : null}

      {card.kind === "fix" && (card.payload.deleteText || card.payload.insertText) ? (
        <div
          className={cn(
            "text-xs leading-relaxed space-y-1 transition-opacity duration-300",
            phase !== "steady" && "opacity-70"
          )}
        >
          {card.payload.deleteText ? (
            <p className="suggestion-preview-delete">{card.payload.deleteText}</p>
          ) : null}
          {card.normalizedInsert ? (
            <p className="suggestion-preview-insert">
              <PlaceholderHighlightedText text={card.normalizedInsert} />
            </p>
          ) : null}
        </div>
      ) : null}

      {card.kind === "redraft" ? (
        <div
          className={cn(
            "space-y-1 transition-opacity duration-300",
            phase !== "steady" && "opacity-70"
          )}
        >
          <p className="text-[10px] text-[var(--muted-foreground)]">
            Replaces the entire field
            {card.comment.contentPath ? ` (${card.comment.contentPath})` : ""}.
          </p>
          {phase === "steady" && validation.documentChanged ? (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200/80 rounded px-2 py-1.5 leading-snug">
              The field changed after this draft was created — accepting will replace the
              current content.
            </p>
          ) : null}
          <div className="suggestion-preview-insert max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed">
            <PlaceholderHighlightedText text={card.redraft.markdown} />
          </div>
        </div>
      ) : null}

      {showActions ? (
        <>
          {reasoning ? (
            <p className="text-[11px] text-[var(--muted-foreground)]">{reasoning}</p>
          ) : null}
          {linkedEval?.reasoning ? (
            <p className="text-[11px] text-[var(--muted-foreground)] border-t border-[var(--border)] pt-2">
              {linkedEval.reasoning}
            </p>
          ) : null}

          {evidenceSources.length > 0 ? (
            <div className="text-[10px] text-[var(--muted-foreground)] border-t border-[var(--border)] pt-2 space-y-1">
              <p className="font-medium text-[var(--foreground)]">Sources</p>
              <ul className="space-y-1">
                {evidenceSources.map((source) => (
                  <li key={source.citationId}>
                    {source.filename}, p. {source.pageNumber}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={pending || !canResolve || !validation.canApply}
              title={!canResolve ? RESOLVE_HINT : undefined}
              onClick={onAccept}
            >
              {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={pending || !canResolve}
              title={!canResolve ? RESOLVE_HINT : undefined}
              onClick={onDismiss}
            >
              <X className="size-3" />
              Dismiss
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Layer that runs exit animation after mount (double rAF). */
function ExitingSuggestionLayer({
  card,
  phase,
  exitRef,
}: {
  card: FrozenCard;
  phase: CardPhase;
  exitRef: RefObject<HTMLDivElement | null>;
}) {
  const [animateOut, setAnimateOut] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;
    void afterPaint().then(() => {
      if (!cancelled) setAnimateOut(true);
    });
    return () => {
      cancelled = true;
    };
  }, [card.comment.id]);

  return (
    <div
      ref={exitRef}
      className={cn(
        "suggestion-card-stack__exit",
        animateOut && "suggestion-card-animate-out"
      )}
    >
      <SuggestionCardFace
        card={card}
        phase={phase}
        showActions={false}
        pending
        validation={LOCATABLE_VALIDATION}
        queueStaleHint={null}
        canResolve={false}
        onAccept={() => {}}
        onDismiss={() => {}}
      />
    </div>
  );
}

/** Parked handoff when the next suggestion is off-screen. */
function SuggestionQueueBridgeCard({
  remainingTotal,
  criterionLabel,
  onGo,
}: {
  remainingTotal: number;
  criterionLabel?: string;
  onGo: () => void;
}) {
  const goRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    goRef.current?.focus();
  }, []);

  return (
    <div className="rounded-md border border-violet-500/30 bg-[var(--card)] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wide">
          Next suggestion
        </span>
        {criterionLabel ? (
          <span className="text-[10px] font-medium text-[var(--muted-foreground)] truncate">
            {criterionLabel}
          </span>
        ) : null}
      </div>
      <p className="text-xs leading-snug text-[var(--foreground)]">
        {remainingTotal === 1
          ? "1 suggestion remaining farther in this section."
          : `${remainingTotal} suggestions remaining — next is farther in this section.`}
      </p>
      <Button
        ref={goRef}
        size="sm"
        className="h-7 text-xs w-full"
        onClick={onGo}
      >
        <ArrowDown className="size-3" />
        Go to next
      </Button>
    </div>
  );
}

/** Incoming card after queue advances. */
function EnteringSuggestionLayer({
  card,
  enterRef,
  showActions,
  pending,
  validation,
  queueStaleHint,
  canResolve,
  onAccept,
  onDismiss,
}: {
  card: FrozenCard;
  enterRef: RefObject<HTMLDivElement | null>;
  showActions: boolean;
  pending: boolean;
  validation: SuggestionValidation;
  queueStaleHint: string | null;
  canResolve: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const [animateIn, setAnimateIn] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;
    void afterPaint().then(() => {
      if (!cancelled) setAnimateIn(true);
    });
    return () => {
      cancelled = true;
    };
  }, [card.comment.id]);

  return (
    <div
      ref={enterRef}
      className={cn(animateIn && "suggestion-card-animate-in")}
    >
      <SuggestionCardFace
        card={card}
        phase="steady"
        showActions={showActions}
        pending={pending}
        validation={validation}
        queueStaleHint={queueStaleHint}
        canResolve={canResolve}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />
    </div>
  );
}

export function SectionSuggestionCard({ section }: { section: SectionType }) {
  const { report, readOnly, currentUserId, refresh } = useReportData();
  const { getUser } = useUserDirectory();
  const canResolve =
    !readOnly &&
    (currentUserId === report.authorId ||
      getUser(currentUserId)?.role === "manager");
  const {
    evaluations,
    beginSuggestionApplyTransition,
    enterSuggestionQueueBridge,
    endSuggestionApplyTransition,
    suggestionApplyTransition,
  } = useReportEvaluations();
  const { comments, setComments } = useReportComments();
  const { sections, replaceSection } = useReportSections();
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<CardPhase>("steady");
  const [frozenCard, setFrozenCard] = useState<FrozenCard | null>(null);
  const [exitingCard, setExitingCard] = useState<FrozenCard | null>(null);
  const [queueTransition, setQueueTransition] = useState<QueueTransition>(null);
  const exitRef = useRef<HTMLDivElement>(null);
  const enterRef = useRef<HTMLDivElement>(null);

  const openSorted = useMemo(
    () => sortedOpenSuggestionsForSection(section, comments, evaluations),
    [section, comments, evaluations]
  );

  const active = openSorted[0] ?? null;
  const total = openSorted.length;

  const liveCard = useMemo(
    () =>
      active ? buildFrozenCard(active, evaluations, 1, total) : null,
    [active, evaluations, total]
  );

  const sectionContent = sections[section];

  const activeValidation = useMemo(() => {
    if (!active) {
      return LOCATABLE_VALIDATION;
    }
    return validateSuggestionLocate(active, section, sectionContent);
  }, [active, section, sectionContent]);

  const queueStaleHint = useMemo(() => {
    const { total: openTotal, stale } = countStaleOpenSuggestions(
      section,
      comments,
      evaluations,
      sectionContent
    );
    if (openTotal <= 1 || stale === 0) return null;
    return `${stale} of ${openTotal} suggestions in this section may no longer apply after recent edits.`;
  }, [section, comments, evaluations, sectionContent]);

  const bridge = suggestionApplyTransition[section]?.bridge;
  const showBridge =
    !!bridge && !!liveCard && liveCard.comment.id === bridge.nextCommentId;

  // Queue changed under a parked bridge (regen, external resolve) — drop the hold.
  useLayoutEffect(() => {
    if (!bridge) return;
    if (showBridge) return;
    endSuggestionApplyTransition(section);
  }, [bridge, showBridge, section, endSuggestionApplyTransition]);

  const animateEnterNext = useCallback(async () => {
    setQueueTransition("enter");
    setPhase("steady");

    await afterPaint();
    await waitForAnimation(enterRef.current, SUGGESTION_CARD_ENTER_MS);
    await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);
    setQueueTransition(null);
  }, []);

  const animateQueueTransition = useCallback(
    async (
      closingSnapshot: FrozenCard,
      nextComment: CommentRecord,
      parkCenterY: number | null
    ): Promise<QueueAdvanceOutcome> => {
      setFrozenCard(null);
      setExitingCard(closingSnapshot);
      setQueueTransition("exit");
      setPhase("applied");

      await afterPaint();
      await waitForAnimation(exitRef.current, SUGGESTION_CARD_EXIT_MS);

      setExitingCard(null);
      await delay(SUGGESTION_NEXT_PREVIEW_DELAY_MS);

      const needsBridge =
        parkCenterY != null && !isSuggestionTargetInViewport(nextComment);

      if (needsBridge) {
        enterSuggestionQueueBridge(section, {
          nextCommentId: nextComment.id,
        });
        setQueueTransition(null);
        setPhase("steady");
        return "bridge";
      }

      // Nearby next: release the park so the gutter can slide to the new field.
      beginSuggestionApplyTransition(section, nextComment.id, "accept");
      setPhase("preparing-next");
      await animateEnterNext();
      return "advanced";
    },
    [
      section,
      enterSuggestionQueueBridge,
      beginSuggestionApplyTransition,
      animateEnterNext,
    ]
  );

  const handleGoToNext = useCallback(async () => {
    if (!showBridge || !liveCard || pending) return;

    const mode = suggestionApplyTransition[section]?.mode ?? "accept";
    scrollToSuggestionComment(liveCard.comment);

    // Clear park Y so the gutter can follow the next field; keep preview held
    // until the enter animation finishes.
    beginSuggestionApplyTransition(section, liveCard.comment.id, mode);

    setPending(true);
    try {
      await afterPaint();
      await animateEnterNext();
    } finally {
      endSuggestionApplyTransition(section);
      setPending(false);
    }
  }, [
    showBridge,
    liveCard,
    pending,
    section,
    suggestionApplyTransition,
    beginSuggestionApplyTransition,
    animateEnterNext,
    endSuggestionApplyTransition,
  ]);

  const handleAccept = useCallback(async () => {
    if (!liveCard || pending || !canResolve) return;

    const locateCheck = validateSuggestionLocate(
      liveCard.comment,
      section,
      sections[section]
    );
    if (!locateCheck.canApply) {
      toast.error(suggestionStaleMessage(locateCheck));
      return;
    }

    const snapshot = liveCard;
    const commentId = snapshot.comment.id;
    const nextInQueue = openSorted[1] ?? null;
    const hasQueue = snapshot.queueTotal > 1 && nextInQueue != null;
    // Capture before comments/gutter re-anchor after resolve.
    const parkCenterY = hasQueue
      ? measureSuggestionGutterParkCenterY(section)
      : null;

    setPending(true);
    setFrozenCard(snapshot);
    setPhase("applying");

    let retainHold = false;
    try {
      beginSuggestionApplyTransition(section, commentId, "accept", {
        parkCenterY: parkCenterY ?? undefined,
      });

      const result = await acceptSuggestion({
        reportId: report.id,
        section,
        comment: snapshot.comment,
        sectionContent: sections[section] as Record<string, unknown>,
      });
      if (!result.ok) {
        if (result.reason === "status_failed") {
          throw (
            result.error instanceof CommentPersistError
              ? result.error
              : new CommentPersistError(0, "Could not update suggestion")
          );
        }
        if (result.reason === "save_failed") {
          throw (
            result.error instanceof SectionPersistError
              ? result.error
              : new SectionPersistError(0, "Failed to save section")
          );
        }
        throw new Error("Suggestion could not be located");
      }
      replaceSection(section, result.nextSection as unknown);

      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, status: "resolved" as const } : c
        )
      );
      setPhase("applied");
      await delay(SUGGESTION_APPLY_SETTLE_MS);

      if (hasQueue && nextInQueue) {
        const outcome = await animateQueueTransition(
          snapshot,
          nextInQueue,
          parkCenterY
        );
        retainHold = outcome === "bridge";
      } else {
        setFrozenCard(null);
        setPhase("steady");
        await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);
      }

      toast.success("Suggestion applied");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof SectionPersistError
          ? err.message
          : err instanceof CommentPersistError
            ? "Change saved but couldn't mark suggestion as resolved. It may reappear — try dismissing it."
            : "Could not apply suggestion"
      );
      await refresh();
      setFrozenCard(null);
      setExitingCard(null);
      setQueueTransition(null);
      setPhase("steady");
    } finally {
      if (!retainHold) {
        endSuggestionApplyTransition(section);
      }
      setPending(false);
    }
  }, [
    liveCard,
    pending,
    canResolve,
    section,
    sections,
    openSorted,
    report.id,
    replaceSection,
    animateQueueTransition,
    setComments,
    refresh,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  ]);

  const handleDismiss = useCallback(async () => {
    if (!liveCard || pending || !canResolve) return;

    const snapshot = liveCard;
    const commentId = snapshot.comment.id;
    const nextInQueue = openSorted[1] ?? null;
    const hasQueue = snapshot.queueTotal > 1 && nextInQueue != null;
    const parkCenterY = hasQueue
      ? measureSuggestionGutterParkCenterY(section)
      : null;

    setPending(true);
    setFrozenCard(snapshot);
    setPhase("applying");

    let retainHold = false;
    try {
      beginSuggestionApplyTransition(section, commentId, "dismiss", {
        parkCenterY: parkCenterY ?? undefined,
      });

      const result = await dismissSuggestion({
        reportId: report.id,
        section,
        comment: snapshot.comment,
        sectionContent: sections[section] as Record<string, unknown>,
      });
      if (!result.ok) {
        if (result.reason === "status_failed") {
          throw (
            result.error instanceof CommentPersistError
              ? result.error
              : new CommentPersistError(0, "Could not update suggestion")
          );
        }
        if (result.reason === "save_failed") {
          throw (
            result.error instanceof SectionPersistError
              ? result.error
              : new SectionPersistError(0, "Failed to save section")
          );
        }
        throw new Error("Failed to save section");
      }
      if (result.nextSection) {
        replaceSection(
          section,
          result.nextSection as unknown
        );
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));

      setPhase("applied");
      await delay(SUGGESTION_APPLY_SETTLE_MS);

      if (hasQueue && nextInQueue) {
        const outcome = await animateQueueTransition(
          snapshot,
          nextInQueue,
          parkCenterY
        );
        retainHold = outcome === "bridge";
      } else {
        setFrozenCard(null);
        setPhase("steady");
        await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);
      }

      toast.success("Suggestion dismissed");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof CommentPersistError || err instanceof SectionPersistError
          ? err.message
          : "Could not dismiss suggestion"
      );
      await refresh();
      setFrozenCard(null);
      setExitingCard(null);
      setQueueTransition(null);
      setPhase("steady");
    } finally {
      if (!retainHold) {
        endSuggestionApplyTransition(section);
      }
      setPending(false);
    }
  }, [
    liveCard,
    pending,
    canResolve,
    section,
    sections,
    openSorted,
    report.id,
    replaceSection,
    animateQueueTransition,
    setComments,
    refresh,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  ]);

  if (showBridge && liveCard) {
    return (
      <SuggestionQueueBridgeCard
        remainingTotal={total}
        criterionLabel={liveCard.linkedEval?.criterionLabel}
        onGo={() => {
          void handleGoToNext();
        }}
      />
    );
  }

  if (!liveCard && !exitingCard && !frozenCard) {
    return (
      <p className="text-[11px] text-[var(--muted-foreground)] px-1 py-2">
        No pending suggestions for this section. Run criteria, then use Suggest fixes
        when gaps appear.
      </p>
    );
  }

  if (queueTransition === "exit" && exitingCard) {
    return (
      <div className="suggestion-card-stack">
        <ExitingSuggestionLayer card={exitingCard} phase={phase} exitRef={exitRef} />
      </div>
    );
  }

  if (queueTransition === "enter" && liveCard) {
    return (
      <EnteringSuggestionLayer
        card={liveCard}
        enterRef={enterRef}
        showActions
        pending={pending}
        validation={activeValidation}
        queueStaleHint={queueStaleHint}
        canResolve={canResolve}
        onAccept={handleAccept}
        onDismiss={handleDismiss}
      />
    );
  }

  const displayCard = frozenCard ?? liveCard;
  if (!displayCard) return null;

  return (
    <SuggestionCardFace
      card={displayCard}
      phase={phase}
      showActions={phase === "steady"}
      pending={pending}
      validation={
        displayCard.comment.id === active?.id
          ? activeValidation
          : LOCATABLE_VALIDATION
      }
      queueStaleHint={phase === "steady" ? queueStaleHint : null}
      canResolve={canResolve}
      onAccept={handleAccept}
      onDismiss={handleDismiss}
    />
  );
}
