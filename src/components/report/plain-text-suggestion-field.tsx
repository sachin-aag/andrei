"use client";

import { useCallback, useMemo, useState } from "react";
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
import { useUserDirectory } from "@/providers/user-directory-provider";
import {
  activeSuggestionForSection,
  parseAiFixCommentContent,
} from "@/lib/ai/suggestion-gating";
import { applyStructuredFieldSuggestion } from "@/lib/suggestions/apply-field";
import { buildPlainTextSuggestionPreview } from "@/lib/suggestions/plain-text-preview";
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
  const [pending, setPending] = useState(false);
  const [applySettling, setApplySettling] = useState(false);

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

  const showInlineActions = Boolean(
    activeComment && previewSegments && !applySettling
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
      {showInlineActions && activeComment ? (
        <SuggestionInlineActions
          suggestionId={activeComment.id}
          pending={pending}
          acceptDisabled={!canResolve || !activeValidation?.canApply}
          dismissDisabled={!canResolve}
          onAccept={() => void applyActive()}
          onDismiss={() => void dismissActive()}
        />
      ) : null}
      <PlainTextHighlightedInput
        fieldAnchor={fieldAnchor}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        aria-label={label}
      />
    </div>
  );
}
