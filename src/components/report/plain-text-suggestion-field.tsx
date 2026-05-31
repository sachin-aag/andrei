"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { PlainTextHighlightedInput } from "@/components/report/plain-text-highlighted-input";
import { PlainTextPlaceholderSpans } from "@/components/report/plain-text-placeholder-spans";
import { SuggestionInlineActions } from "@/components/report/suggestion-inline-actions";
import {
  useReportComments,
  useReportData,
  useReportEvaluations,
  useReportPlaceholders,
  useReportSections,
} from "@/providers/report-provider";
import { useUserDirectory } from "@/providers/user-directory-provider";
import {
  activeSuggestionForSection,
  parseAiFixCommentContent,
} from "@/lib/ai/suggestion-gating";
import { applyStructuredFieldSuggestion } from "@/lib/suggestions/apply-field";
import {
  buildPlainTextSuggestionPreview,
  splitPlainTextPreviewSegments,
  type PlainTextPreviewSegment,
} from "@/lib/suggestions/plain-text-preview";
import { resolveSuggestionFieldPath } from "@/lib/suggestions/resolve-suggestion-field-path";
import {
  suggestionStaleMessage,
  validateSuggestionLocate,
} from "@/lib/suggestions/validate-suggestion";
import {
  SUGGESTION_APPLY_SETTLE_MS,
  SUGGESTION_INLINE_REVEAL_DELAY_MS,
  delay,
} from "@/lib/suggestions/apply-transition";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import {
  CommentPersistError,
  patchCommentStatus,
} from "@/lib/suggestions/persist-comment-status";
import { fromPosFromPlaceholderId } from "@/lib/placeholders/find";
import { cn } from "@/lib/utils";
import type { SectionType } from "@/db/schema";
import type { SectionContentMap } from "@/types/sections";

export function PlainTextSuggestionField({
  section,
  contentPath,
  label,
  value,
  onChange,
  disabled,
  className,
  placeholder,
}: {
  section: SectionType;
  contentPath: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const { report, readOnly, currentUserId, refresh } = useReportData();
  const { getUser } = useUserDirectory();
  const canResolve =
    !readOnly &&
    !disabled &&
    (currentUserId === report.authorId ||
      getUser(currentUserId)?.role === "manager");
  const { comments, setComments } = useReportComments();
  const {
    evaluations,
    isSuggestionPreviewHeld,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  } = useReportEvaluations();
  const { sections, replaceSection } = useReportSections();
  const { focusedPanelPlaceholderId } = useReportPlaceholders();
  const [pending, setPending] = useState(false);
  /** Keep the preview shell mounted while apply transitions run (avoids height jump). */
  const [applySettling, setApplySettling] = useState(false);
  const previewShellRef = useRef<HTMLDivElement>(null);
  const [editHeight, setEditHeight] = useState(0);
  const [lockedShellHeight, setLockedShellHeight] = useState<number | null>(null);

  const onEditLayoutHeight = useCallback((height: number) => {
    setEditHeight((prev) => (prev === height ? prev : height));
  }, []);

  const activeComment = useMemo(() => {
    if (isSuggestionPreviewHeld(section)) return null;
    const active = activeSuggestionForSection(section, comments, evaluations);
    if (!active) return null;

    const path = active.contentPath;
    if (path === contentPath) return active;
    if (
      path === "narrative" &&
      section === "improve" &&
      contentPath === "correctiveActions"
    ) {
      return active;
    }
    if (
      path === "narrative" &&
      section === "control" &&
      contentPath === "preventiveActions"
    ) {
      return active;
    }
    return null;
  }, [comments, evaluations, contentPath, section, isSuggestionPreviewHeld]);

  const activeValidation = useMemo(() => {
    if (!activeComment) return null;
    return validateSuggestionLocate(
      activeComment,
      section,
      sections[section]
    );
  }, [activeComment, section, sections]);

  const previewSegments = useMemo(() => {
    if (!activeComment || !activeValidation?.canPreview) return null;
    const payload = parseAiFixCommentContent(activeComment.content);
    return buildPlainTextSuggestionPreview(
      value,
      payload.deleteText,
      normalizeSuggestionInsertText(payload.insertText),
      activeComment.anchorText
    );
  }, [activeComment, activeValidation, value]);

  const showInlinePreview = Boolean(
    (activeComment && previewSegments) || applySettling
  );
  const showSettledText = applySettling && !activeComment;

  const splitPreview = useMemo(
    () =>
      previewSegments
        ? splitPlainTextPreviewSegments(previewSegments)
        : { before: [], suggestion: [], after: [] },
    [previewSegments]
  );

  /** Size preview shell to full content (no in-field scroll), at least the last edit height. */
  useLayoutEffect(() => {
    if (!showInlinePreview) return;
    const el = previewShellRef.current;
    if (!el) return;
    const next = Math.max(editHeight, el.scrollHeight);
    setLockedShellHeight((prev) => (prev === next ? prev : next));
  }, [showInlinePreview, showSettledText, previewSegments, value, splitPreview, editHeight]);

  useEffect(() => {
    if (showInlinePreview || lockedShellHeight == null) return;
    const id = requestAnimationFrame(() => setLockedShellHeight(null));
    return () => cancelAnimationFrame(id);
  }, [showInlinePreview, lockedShellHeight, value]);

  const focusedFromPos = useMemo(() => {
    if (!focusedPanelPlaceholderId) return null;
    return fromPosFromPlaceholderId(
      focusedPanelPlaceholderId,
      section,
      contentPath
    );
  }, [focusedPanelPlaceholderId, section, contentPath]);

  const renderSuggestionRun = (
    text: string,
    suggestionClass: string,
    key: number,
    baseOffset: number
  ) => (
    <PlainTextPlaceholderSpans
      key={key}
      text={text}
      baseOffset={baseOffset}
      focusedFromPos={focusedFromPos}
      wrapClassName={suggestionClass}
      insideSuggestion
    />
  );

  const renderSegment = (
    seg: PlainTextPreviewSegment,
    key: number,
    baseOffset: number
  ) => {
    if (seg.kind === "delete") {
      return renderSuggestionRun(
        seg.text,
        "suggestion-delete suggestion-delete-fix",
        key,
        baseOffset
      );
    }
    if (seg.kind === "insert") {
      return renderSuggestionRun(
        seg.text,
        "suggestion-insert suggestion-insert-fix",
        key,
        baseOffset
      );
    }
    return (
      <PlainTextPlaceholderSpans
        key={key}
        text={seg.text}
        baseOffset={baseOffset}
        focusedFromPos={focusedFromPos}
      />
    );
  };

  const renderPreviewSegments = (
    segments: PlainTextPreviewSegment[],
    keyOffset: number
  ) => {
    let offset = 0;
    return segments.map((seg, i) => {
      const node = renderSegment(seg, keyOffset + i, offset);
      offset += seg.text.length;
      return node;
    });
  };

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

  const applyActive = useCallback(async () => {
    if (!activeComment || pending || !canResolve) return;

    const locateCheck = validateSuggestionLocate(
      activeComment,
      section,
      sections[section]
    );
    if (!locateCheck.canApply) {
      toast.error(suggestionStaleMessage(locateCheck));
      return;
    }

    setLockedShellHeight(previewShellRef.current?.offsetHeight ?? null);
    setApplySettling(true);
    setPending(true);
    try {
      beginSuggestionApplyTransition(section, activeComment.id);
      const payload = parseAiFixCommentContent(activeComment.content);
      const fieldPath = resolveSuggestionFieldPath(
        section,
        activeComment.contentPath,
        contentPath
      );
      const current = sections[section] as Record<string, unknown>;
      const nextRecord = applyStructuredFieldSuggestion(
        current,
        fieldPath,
        payload.insertText,
        payload.deleteText,
        activeComment.anchorText
      );
      const nextSection = nextRecord as SectionContentMap[typeof section];
      const nextValue = fieldPath
        .split(".")
        .reduce<unknown>((obj, key) => {
          if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            return (obj as Record<string, unknown>)[key];
          }
          return undefined;
        }, nextRecord);
      if (typeof nextValue === "string") {
        onChange(nextValue);
      }
      replaceSection(section, nextSection);
      await saveSection(nextSection);
      await patchCommentStatus(report.id, activeComment.id, "resolved");
      setComments((prev) =>
        prev.map((c) =>
          c.id === activeComment.id ? { ...c, status: "resolved" as const } : c
        )
      );
      await delay(SUGGESTION_APPLY_SETTLE_MS);
      await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);

      toast.success("Suggestion applied");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof CommentPersistError
          ? "Change saved but couldn't mark suggestion as resolved. It may reappear — try dismissing it."
          : "Could not apply suggestion"
      );
      await refresh();
    } finally {
      endSuggestionApplyTransition(section);
      setPending(false);
      setApplySettling(false);
    }
  }, [
    activeComment,
    pending,
    canResolve,
    section,
    contentPath,
    sections,
    report.id,
    onChange,
    replaceSection,
    saveSection,
    setComments,
    refresh,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  ]);

  const dismissActive = useCallback(async () => {
    if (!activeComment || pending || !canResolve) return;

    setLockedShellHeight(previewShellRef.current?.offsetHeight ?? null);
    setApplySettling(true);
    setPending(true);
    try {
      beginSuggestionApplyTransition(section, activeComment.id);
      await patchCommentStatus(report.id, activeComment.id, "dismissed");
      setComments((prev) => prev.filter((c) => c.id !== activeComment.id));
      await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);

      toast.success("Suggestion dismissed");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof CommentPersistError
          ? err.message
          : "Could not dismiss suggestion"
      );
      await refresh();
    } finally {
      endSuggestionApplyTransition(section);
      setPending(false);
      setApplySettling(false);
    }
  }, [
    activeComment,
    pending,
    canResolve,
    report.id,
    section,
    setComments,
    refresh,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  ]);

  const fieldAnchor = `${section}.${contentPath}`;

  return (
    <div className="space-y-1.5 scroll-mt-24">
      <Label>{label}</Label>
      {showInlinePreview ? (
        <div
          ref={previewShellRef}
          data-field-anchor={fieldAnchor}
          className={cn(
            "w-full rounded-md border border-violet-500/35 bg-[var(--card)] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
            "ring-1 ring-violet-400/20",
            applySettling && "suggestion-field-settling",
            className
          )}
          style={{
            minHeight:
              lockedShellHeight ?? (editHeight > 0 ? editHeight : undefined),
          }}
          aria-label={
            showSettledText
              ? `${label} — applied`
              : `${label} — suggested change preview`
          }
        >
          {showSettledText ? (
            <PlainTextPlaceholderSpans
              text={value}
              focusedFromPos={focusedFromPos}
            />
          ) : (
            <>
              {renderPreviewSegments(splitPreview.before, 0)}
              {renderPreviewSegments(
                splitPreview.suggestion,
                splitPreview.before.length
              )}
              {activeComment && splitPreview.suggestion.length > 0 ? (
                <SuggestionInlineActions
                  suggestionId={activeComment.id}
                  pending={pending}
                  acceptDisabled={!canResolve || !activeValidation?.canApply}
                  dismissDisabled={!canResolve}
                  onAccept={() => void applyActive()}
                  onDismiss={() => void dismissActive()}
                />
              ) : null}
              {renderPreviewSegments(
                splitPreview.after,
                splitPreview.before.length + splitPreview.suggestion.length + 1
              )}
            </>
          )}
        </div>
      ) : (
        <PlainTextHighlightedInput
          fieldAnchor={fieldAnchor}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          shellMinHeight={lockedShellHeight}
          onEditLayoutHeight={onEditLayoutHeight}
          aria-label={label}
        />
      )}
    </div>
  );
}
