"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { PlainTextHighlightedInput } from "@/components/report/plain-text-highlighted-input";
import { SuggestionInlineActions } from "@/components/report/suggestion-inline-actions";
import {
  useReportComments,
  useReportData,
  useReportEvaluations,
  useReportSections,
} from "@/providers/report-provider";
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
import { splitPlainTextWithPlaceholders } from "@/lib/placeholders/plain-text-segments";
import { cn } from "@/lib/utils";
import type { CommentRecord } from "@/types/report";
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
  const { report } = useReportData();
  const { comments, setComments } = useReportComments();
  const {
    evaluations,
    isSuggestionPreviewHeld,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  } = useReportEvaluations();
  const { sections, replaceSection } = useReportSections();
  const [pending, setPending] = useState(false);
  /** Keep the preview shell mounted while apply transitions run (avoids height jump). */
  const [applySettling, setApplySettling] = useState(false);
  const previewShellRef = useRef<HTMLDivElement>(null);
  const editHeightRef = useRef(0);
  const [lockedShellHeight, setLockedShellHeight] = useState<number | null>(null);

  const onEditLayoutHeight = useCallback((height: number) => {
    editHeightRef.current = height;
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
    const next = Math.max(editHeightRef.current, el.scrollHeight);
    setLockedShellHeight((prev) => (prev === next ? prev : next));
  }, [showInlinePreview, showSettledText, previewSegments, value, splitPreview]);

  useEffect(() => {
    if (showInlinePreview || lockedShellHeight == null) return;
    const id = requestAnimationFrame(() => setLockedShellHeight(null));
    return () => cancelAnimationFrame(id);
  }, [showInlinePreview, lockedShellHeight, value]);

  const renderSuggestionRun = (
    text: string,
    suggestionClass: string,
    key: number
  ) => {
    const parts = splitPlainTextWithPlaceholders(text);
    if (parts.length === 1 && parts[0]!.kind === "text") {
      return (
        <span key={key} className={suggestionClass}>
          {text}
        </span>
      );
    }
    return (
      <span key={key}>
        {parts.map((part, i) =>
          part.kind === "placeholder" ? (
            <span
              key={i}
              className="placeholder-todo-mirror placeholder-todo-over-suggestion"
            >
              {part.text}
            </span>
          ) : (
            <span key={i} className={suggestionClass}>
              {part.text}
            </span>
          )
        )}
      </span>
    );
  };

  const renderSegment = (seg: PlainTextPreviewSegment, key: number) => {
    if (seg.kind === "delete") {
      return renderSuggestionRun(seg.text, "suggestion-delete suggestion-delete-fix", key);
    }
    if (seg.kind === "insert") {
      return renderSuggestionRun(seg.text, "suggestion-insert suggestion-insert-fix", key);
    }
    return <span key={key}>{seg.text}</span>;
  };

  const persistComment = useCallback(
    async (commentId: string, status: "resolved" | "dismissed") => {
      const res = await fetch(`/api/reports/${report.id}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update suggestion");

      if (status === "dismissed") {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        return;
      }

      const data = await res.json();
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, ...(data.comment as CommentRecord) } : c
        )
      );
    },
    [report.id, setComments]
  );

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
    if (!activeComment || pending || disabled) return;

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
      setComments((prev) =>
        prev.map((c) =>
          c.id === activeComment.id ? { ...c, status: "resolved" as const } : c
        )
      );
      await delay(SUGGESTION_APPLY_SETTLE_MS);
      await persistComment(activeComment.id, "resolved");
      await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);

      toast.success("Suggestion applied");
    } catch (err) {
      console.error(err);
      toast.error("Could not apply suggestion");
    } finally {
      endSuggestionApplyTransition(section);
      setPending(false);
      setApplySettling(false);
    }
  }, [
    activeComment,
    pending,
    disabled,
    section,
    contentPath,
    sections,
    onChange,
    replaceSection,
    saveSection,
    persistComment,
    setComments,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  ]);

  const dismissActive = useCallback(async () => {
    if (!activeComment || pending || disabled) return;

    setLockedShellHeight(previewShellRef.current?.offsetHeight ?? null);
    setApplySettling(true);
    setPending(true);
    try {
      beginSuggestionApplyTransition(section, activeComment.id);
      setComments((prev) => prev.filter((c) => c.id !== activeComment.id));
      await persistComment(activeComment.id, "dismissed");
      await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);

      toast.success("Suggestion dismissed");
    } catch (err) {
      console.error(err);
      toast.error("Could not dismiss suggestion");
    } finally {
      endSuggestionApplyTransition(section);
      setPending(false);
      setApplySettling(false);
    }
  }, [
    activeComment,
    pending,
    disabled,
    persistComment,
    section,
    setComments,
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
              lockedShellHeight ??
              (editHeightRef.current > 0 ? editHeightRef.current : undefined),
          }}
          aria-label={
            showSettledText
              ? `${label} — applied`
              : `${label} — suggested change preview`
          }
        >
          {showSettledText ? (
            value
          ) : (
            <>
              {splitPreview.before.map((seg, i) => renderSegment(seg, i))}
              {splitPreview.suggestion.map((seg, i) =>
                renderSegment(seg, splitPreview.before.length + i)
              )}
              {activeComment && splitPreview.suggestion.length > 0 ? (
                <SuggestionInlineActions
                  suggestionId={activeComment.id}
                  pending={pending}
                  disabled={disabled || !activeValidation?.canApply}
                  onAccept={() => void applyActive()}
                  onDismiss={() => void dismissActive()}
                />
              ) : null}
              {splitPreview.after.map((seg, i) =>
                renderSegment(
                  seg,
                  splitPreview.before.length + splitPreview.suggestion.length + 1 + i
                )
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
