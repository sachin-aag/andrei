"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Check, Loader2, X } from "lucide-react";
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
  sortedOpenSuggestionsForSection,
  type ParsedAiFixPayload,
} from "@/lib/ai/suggestion-gating";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import {
  getRichFieldValue,
  setRichFieldValue,
} from "@/lib/suggestions/rich-field-value";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  acceptPendingNarrativeSuggestion,
  applyNarrativeSuggestion,
  buildSuggestionEdit,
  narrativeHasSuggestionMarks,
  removePendingNarrativeSuggestion,
} from "@/lib/suggestions/apply-narrative-suggestion";
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
import { applyStructuredFieldSuggestion } from "@/lib/suggestions/apply-field";
import {
  CommentPersistError,
  patchCommentStatus,
} from "@/lib/suggestions/persist-comment-status";
import {
  countStaleOpenSuggestions,
  suggestionStaleMessage,
  validateSuggestionLocate,
  type SuggestionValidation,
} from "@/lib/suggestions/validate-suggestion";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";
import type { SectionContentMap } from "@/types/sections";

type CardPhase = "steady" | "applying" | "applied" | "preparing-next";
type QueueTransition = null | "exit" | "enter";

const LOCATABLE_VALIDATION: SuggestionValidation = {
  locateStatus: "locatable",
  documentChanged: false,
  canApply: true,
  canPreview: true,
};

type FrozenCard = {
  comment: CommentRecord;
  payload: ParsedAiFixPayload;
  normalizedInsert: string;
  linkedEval: EvaluationRecord | undefined;
  queueIndex: number;
  queueTotal: number;
};

function buildFrozenCard(
  comment: CommentRecord,
  evaluations: EvaluationRecord[],
  queueIndex: number,
  queueTotal: number
): FrozenCard {
  const payload = parseAiFixCommentContent(comment.content);
  return {
    comment,
    payload,
    normalizedInsert: normalizeSuggestionInsertText(payload.insertText),
    linkedEval: comment.evaluationId
      ? evaluations.find((e) => e.id === comment.evaluationId)
      : undefined,
    queueIndex,
    queueTotal,
  };
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
  const { payload, normalizedInsert, linkedEval, queueIndex, queueTotal } = card;
  const eff = linkedEval ? effectiveStatus(linkedEval) : "not_evaluated";

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
          Suggestion {queueIndex} of {queueTotal}
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

      {(payload.deleteText || payload.insertText) && (
        <div
          className={cn(
            "text-xs leading-relaxed space-y-1 transition-opacity duration-300",
            phase !== "steady" && "opacity-70"
          )}
        >
          {payload.deleteText ? (
            <p className="suggestion-preview-delete">{payload.deleteText}</p>
          ) : null}
          {normalizedInsert ? (
            <p className="suggestion-preview-insert">
              {normalizedInsert.split(/(\[[^\]]+\])/g).map((part, i) =>
                part.startsWith("[") ? (
                  <span key={i} className="suggestion-preview-placeholder">
                    {part}
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
          ) : null}
        </div>
      )}

      {showActions ? (
        <>
          {payload.reasoning ? (
            <p className="text-[11px] text-[var(--muted-foreground)]">{payload.reasoning}</p>
          ) : null}
          {linkedEval?.reasoning ? (
            <p className="text-[11px] text-[var(--muted-foreground)] border-t border-[var(--border)] pt-2">
              {linkedEval.reasoning}
            </p>
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
    endSuggestionApplyTransition,
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

  const saveSection = useCallback(
    async (nextContent: SectionContentMap[typeof section]) => {
      const res = await fetch(`/api/reports/${report.id}/sections/${section}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextContent }),
      });
      if (!res.ok) throw new Error("Failed to save section");
    },
    [report.id, section]
  );

  const applyCardToDocument = useCallback(
    async (card: FrozenCard) => {
      const { comment, payload } = card;
      const path = comment.contentPath ?? "narrative";
      const current = sections[section] as Record<string, unknown>;

      if (isRichTargetField(section, path)) {
        const doc = getRichFieldValue(current, path);
        const edit = buildSuggestionEdit(payload);
        const nextDoc = narrativeHasSuggestionMarks(doc, comment.id)
          ? acceptPendingNarrativeSuggestion(doc, comment.id)
          : applyNarrativeSuggestion(doc, comment.id, edit);
        const nextSection = setRichFieldValue(
          current,
          path,
          nextDoc
        ) as SectionContentMap[typeof section];
        replaceSection(section, nextSection);
        await saveSection(nextSection);
        return;
      }

      const nextRecord = applyStructuredFieldSuggestion(
        current,
        path,
        payload.insertText,
        payload.deleteText,
        comment.anchorText
      );
      const nextSection = nextRecord as SectionContentMap[typeof section];
      replaceSection(section, nextSection);
      await saveSection(nextSection);
    },
    [section, sections, replaceSection, saveSection]
  );

  const stripCardFromDocument = useCallback(
    async (card: FrozenCard) => {
      const { comment } = card;
      const path = comment.contentPath ?? "narrative";
      const current = sections[section] as Record<string, unknown>;

      if (!isRichTargetField(section, path)) return;

      const doc = getRichFieldValue(current, path);
      if (!narrativeHasSuggestionMarks(doc, comment.id)) return;

      const nextDoc = removePendingNarrativeSuggestion(doc, comment.id);
      const nextSection = setRichFieldValue(
        current,
        path,
        nextDoc
      ) as SectionContentMap[typeof section];
      replaceSection(section, nextSection);
      await saveSection(nextSection);
    },
    [section, sections, replaceSection, saveSection]
  );

  const animateQueueTransition = useCallback(async (closingSnapshot: FrozenCard) => {
    setFrozenCard(null);
    setExitingCard(closingSnapshot);
    setQueueTransition("exit");
    setPhase("applied");

    await afterPaint();
    await waitForAnimation(exitRef.current, SUGGESTION_CARD_EXIT_MS);

    setExitingCard(null);
    setPhase("preparing-next");
    await delay(SUGGESTION_NEXT_PREVIEW_DELAY_MS);

    setQueueTransition("enter");
    setPhase("steady");

    await afterPaint();
    await waitForAnimation(enterRef.current, SUGGESTION_CARD_ENTER_MS);
    await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);
    setQueueTransition(null);
  }, []);

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
    const hasQueue = snapshot.queueTotal > 1;

    setPending(true);
    setFrozenCard(snapshot);
    setPhase("applying");

    try {
      beginSuggestionApplyTransition(section, commentId);

      await applyCardToDocument(snapshot);
      await patchCommentStatus(report.id, commentId, "resolved");

      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, status: "resolved" as const } : c
        )
      );
      setPhase("applied");
      await delay(SUGGESTION_APPLY_SETTLE_MS);

      if (hasQueue) {
        await animateQueueTransition(snapshot);
      } else {
        setFrozenCard(null);
        setPhase("steady");
        await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);
      }

      toast.success("Suggestion applied");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof CommentPersistError
          ? "Change saved but couldn't mark suggestion as resolved. It may reappear — try dismissing it."
          : "Could not apply suggestion"
      );
      await refresh();
      setFrozenCard(null);
      setExitingCard(null);
      setQueueTransition(null);
      setPhase("steady");
    } finally {
      endSuggestionApplyTransition(section);
      setPending(false);
    }
  }, [
    liveCard,
    pending,
    canResolve,
    section,
    sections,
    report.id,
    applyCardToDocument,
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
    const hasQueue = snapshot.queueTotal > 1;

    setPending(true);
    setFrozenCard(snapshot);
    setPhase("applying");

    try {
      beginSuggestionApplyTransition(section, commentId);

      await patchCommentStatus(report.id, commentId, "dismissed");
      setComments((prev) => prev.filter((c) => c.id !== commentId));

      try {
        await stripCardFromDocument(snapshot);
      } catch (stripErr) {
        console.warn("Non-fatal: could not strip suggestion marks", stripErr);
      }

      if (hasQueue) {
        await animateQueueTransition(snapshot);
      } else {
        setFrozenCard(null);
        setPhase("steady");
        await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);
      }

      toast.success("Suggestion dismissed");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof CommentPersistError
          ? err.message
          : "Could not dismiss suggestion"
      );
      await refresh();
      setFrozenCard(null);
      setExitingCard(null);
      setQueueTransition(null);
      setPhase("steady");
    } finally {
      endSuggestionApplyTransition(section);
      setPending(false);
    }
  }, [
    liveCard,
    pending,
    canResolve,
    section,
    report.id,
    stripCardFromDocument,
    animateQueueTransition,
    setComments,
    refresh,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  ]);

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
