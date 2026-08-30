"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { PlainTextHighlightedInput } from "@/components/report/plain-text-highlighted-input";
import { PlainTextPlaceholderSpans } from "@/components/report/plain-text-placeholder-spans";
import { SuggestionInlineActions } from "@/components/report/suggestion-inline-actions";
import { isBulkSuggestionApply } from "@/lib/suggestions/apply-transition";
import {
  useReportComments,
  useReportData,
  useReportEvaluations,
  useReportPlaceholders,
  useReportSections,
} from "@/providers/report-provider";
import { useUserDirectory } from "@/providers/user-directory-provider";
import {
  parseAiFixCommentContent,
  parseAiRedraftCommentContent,
} from "@/lib/ai/suggestion-gating";
import {
  getDocumentType,
  suggestionApplyModeFor,
} from "@/lib/document-types";
import { redraftPlainTextValue } from "@/lib/suggestions/apply-redraft";
import { readSuggestionRecord } from "@/lib/suggestions/suggestion-record";
import {
  acceptSuggestion,
  dismissSuggestion,
  CommentPersistError,
  PLACEHOLDER_CONFLICT_MESSAGE,
  SectionPersistError,
} from "@/lib/suggestions/accept-suggestion";
import {
  buildPlainTextSuggestionPreview,
  splitPlainTextPreviewSegments,
  type PlainTextPreviewSegment,
} from "@/lib/suggestions/plain-text-preview";
import { trackChangesOverlaySegments } from "@/lib/suggestions/plain-text-track-changes";
import {
  resolveSuggestionFieldPath,
  suggestionTargetsField,
} from "@/lib/suggestions/resolve-suggestion-field-path";
import {
  firstPreviewableOpenSuggestion,
  suggestionStaleMessage,
  validateSuggestionLocate,
} from "@/lib/suggestions/validate-suggestion";
import {
  SUGGESTION_APPLY_SETTLE_MS,
  SUGGESTION_DIFF_FADE_MS,
  SUGGESTION_INLINE_REVEAL_DELAY_MS,
  delay,
} from "@/lib/suggestions/apply-transition";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { fromPosFromPlaceholderId } from "@/lib/placeholders/find";
import type { SectionType } from "@/db/schema";

function renderPreviewSegment(
  seg: PlainTextPreviewSegment,
  key: number,
  baseOffset: number,
  focusedFromPos: number | null,
  insertClassName = "suggestion-insert suggestion-insert-ai"
) {
  if (seg.kind === "delete") {
    return (
      <PlainTextPlaceholderSpans
        key={key}
        text={seg.text}
        baseOffset={baseOffset}
        focusedFromPos={focusedFromPos}
        wrapClassName="suggestion-delete suggestion-delete-ai"
      />
    );
  }
  if (seg.kind === "insert") {
    return (
      <PlainTextPlaceholderSpans
        key={key}
        text={seg.text}
        baseOffset={baseOffset}
        focusedFromPos={focusedFromPos}
        wrapClassName={insertClassName}
      />
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
}

function previewSegmentsTextLength(segments: PlainTextPreviewSegment[]): number {
  return segments.reduce((n, seg) => n + seg.text.length, 0);
}

function renderPreviewSegments(
  segments: PlainTextPreviewSegment[],
  keyOffset: number,
  baseOffset: number,
  focusedFromPos: number | null,
  insertClassName?: string
) {
  let offset = baseOffset;
  return segments.map((seg, i) => {
    const node = renderPreviewSegment(
      seg,
      keyOffset + i,
      offset,
      focusedFromPos,
      insertClassName
    );
    offset += seg.text.length;
    return node;
  });
}

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
  const { report, readOnly, currentUserId, refresh, trackChangesMode } = useReportData();
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
    suggestionApplyTransition,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  } = useReportEvaluations();
  const { sections, replaceSection } = useReportSections();
  const { focusedPanelPlaceholderId } = useReportPlaceholders();
  const [pending, setPending] = useState(false);
  const [applySettling, setApplySettling] = useState(false);
  const suggestionWidgetAnchorRef = useRef<HTMLSpanElement>(null);
  const [tcBaseline, setTcBaseline] = useState<string | null>(null);
  const [tcBaselineMode, setTcBaselineMode] = useState(trackChangesMode);
  if (tcBaselineMode !== trackChangesMode) {
    setTcBaselineMode(trackChangesMode);
    setTcBaseline(null);
  }

  const handleUserChange = useCallback(
    (next: string) => {
      if (trackChangesMode) {
        setTcBaseline((prev) => (prev === null ? value : prev));
      }
      onChange(next);
    },
    [onChange, trackChangesMode, value]
  );

  const activeComment = useMemo(() => {
    if (isSuggestionPreviewHeld(section)) {
      // Queue bridge: hold the next inline preview until the user jumps or dismisses.
      if (suggestionApplyTransition[section]?.bridge) return null;
      if (isBulkSuggestionApply(suggestionApplyTransition[section]?.mode)) {
        // Overlay is editor-local; the applied `value` is swapped in before
        // the PATCH. Showing the locked card on that wording would paint the
        // suggestion twice. Null here reveals `value` — original for one
        // frame, then the in-memory apply.
        return null;
      }
      // Keep previewing the suggestion currently being applied/dismissed —
      // nulling it out here would flash the original wording before the
      // request resolves and the real result lands.
      const lockedId = suggestionApplyTransition[section]?.gutterAnchorCommentId;
      const locked = lockedId
        ? comments.find((c) => c.id === lockedId)
        : undefined;
      return locked && suggestionTargetsField(section, locked.contentPath, contentPath)
        ? locked
        : null;
    }
    const active = firstPreviewableOpenSuggestion(
      section,
      comments,
      evaluations,
      sections[section]
    );
    if (!active) return null;

    return suggestionTargetsField(section, active.contentPath, contentPath)
      ? active
      : null;
  }, [
    comments,
    evaluations,
    contentPath,
    section,
    sections,
    isSuggestionPreviewHeld,
    suggestionApplyTransition,
  ]);

  const activeValidation = useMemo(() => {
    if (!activeComment) return null;
    return validateSuggestionLocate(
      activeComment,
      section,
      sections[section],
      contentPath
    );
  }, [activeComment, section, sections, contentPath]);

  const previewSegments = useMemo(() => {
    if (!activeComment || !activeValidation?.canPreview) return null;

    // Full-field redraft: whole current value struck, replacement highlighted.
    if (activeComment.kind === "ai_redraft") {
      const redraft = parseAiRedraftCommentContent(activeComment.content);
      const next = redraftPlainTextValue(redraft.markdown);
      const segments: PlainTextPreviewSegment[] = [];
      if (value) segments.push({ kind: "delete", text: value });
      segments.push({ kind: "insert", text: value ? ` ${next}` : next });
      return segments;
    }

    const payload = parseAiFixCommentContent(activeComment.content);
    const located = buildPlainTextSuggestionPreview(
      value,
      payload.deleteText,
      normalizeSuggestionInsertText(payload.insertText),
      activeComment.anchorText,
      payload.second
    );
    if (located) return located;
    const record = readSuggestionRecord(activeComment.content);
    if (typeof record?.intent === "string" && record.intent !== value) {
      const segments: PlainTextPreviewSegment[] = [];
      if (value) segments.push({ kind: "delete", text: value });
      segments.push({
        kind: "insert",
        text: value ? ` ${record.intent}` : record.intent,
      });
      return segments;
    }
    return null;
  }, [activeComment, activeValidation, value]);

  const showInlineSuggestion = Boolean(
    activeComment && previewSegments && !applySettling
  );

  const focusedFromPos = useMemo(() => {
    if (!focusedPanelPlaceholderId) return null;
    return fromPosFromPlaceholderId(
      focusedPanelPlaceholderId,
      section,
      contentPath
    );
  }, [focusedPanelPlaceholderId, section, contentPath]);

  const trackChangeSegments = useMemo(() => {
    if (showInlineSuggestion || !trackChangesMode || tcBaseline === null) {
      return null;
    }
    return trackChangesOverlaySegments(tcBaseline, value);
  }, [showInlineSuggestion, trackChangesMode, tcBaseline, value]);

  const mirrorContent = useMemo(() => {
    if (showInlineSuggestion && previewSegments) {
      const { before, suggestion, after } =
        splitPlainTextPreviewSegments(previewSegments);
      const beforeLen = previewSegmentsTextLength(before);
      const suggestionLen = previewSegmentsTextLength(suggestion);
      return (
        <>
          {renderPreviewSegments(before, 0, 0, focusedFromPos)}
          {renderPreviewSegments(
            suggestion,
            before.length,
            beforeLen,
            focusedFromPos
          )}
          <span
            ref={suggestionWidgetAnchorRef}
            className="inline-block w-0 align-baseline"
            aria-hidden
          />
          {renderPreviewSegments(
            after,
            before.length + suggestion.length,
            beforeLen + suggestionLen,
            focusedFromPos
          )}
        </>
      );
    }
    if (trackChangesMode) {
      const segments =
        trackChangeSegments ??
        (value ? [{ kind: "context" as const, text: value }] : []);
      return (
        <>
          {renderPreviewSegments(
            segments,
            0,
            0,
            focusedFromPos,
            "suggestion-insert"
          )}
        </>
      );
    }
    return undefined;
  }, [
    showInlineSuggestion,
    previewSegments,
    trackChangesMode,
    trackChangeSegments,
    value,
    focusedFromPos,
  ]);

  const applyActive = useCallback(async () => {
    if (!activeComment || pending || !canResolve) return;

    const locateCheck = validateSuggestionLocate(
      activeComment,
      section,
      sections[section],
      contentPath
    );
    if (!locateCheck.canApply) {
      toast.error(suggestionStaleMessage(locateCheck));
      return;
    }

    setPending(true);
    try {
      beginSuggestionApplyTransition(section, activeComment.id, "accept");
      const fieldPath = resolveSuggestionFieldPath(
        section,
        activeComment.contentPath,
        contentPath
      );
      // Let the diff finish fading before the real value swaps in, so the two
      // never animate over each other.
      const [result] = await Promise.all([
        acceptSuggestion({
          reportId: report.id,
          section,
          comment: activeComment,
          sectionContent: sections[section] as Record<string, unknown>,
          fieldContentPath: contentPath,
          applyMode: suggestionApplyModeFor(
            getDocumentType(report.documentType)
          ),
          openComments: comments.filter(
            (c) => c.status === "open" && !c.parentId
          ),
        }),
        delay(SUGGESTION_DIFF_FADE_MS),
      ]);
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
        if (result.reason === "placeholder_conflict") {
          throw new Error(PLACEHOLDER_CONFLICT_MESSAGE);
        }
        throw new Error("Suggestion could not be located");
      }
      const nextSection = result.nextSection as unknown;
      const nextValue = fieldPath
        .split(".")
        .reduce<unknown>((obj, key) => {
          if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            return (obj as Record<string, unknown>)[key];
          }
          return undefined;
        }, result.nextSection);
      if (typeof nextValue === "string") {
        onChange(nextValue);
        if (trackChangesMode) setTcBaseline(nextValue);
      }
      replaceSection(section, nextSection);
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === activeComment.id) {
            return { ...c, status: "resolved" as const };
          }
          const dismissed = result.dismissed.find((row) => row.id === c.id);
          return dismissed ?? c;
        })
      );
      // Only hide the diff preview once the real value has landed — hiding it
      // earlier would reveal the stale original text underneath while the
      // request is still in flight.
      setApplySettling(true);
      await delay(SUGGESTION_APPLY_SETTLE_MS);
      await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);

      toast.success("Suggestion applied");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof SectionPersistError
          ? err.message
          : err instanceof CommentPersistError
            ? "Change saved but couldn't mark suggestion as resolved. It may reappear — try dismissing it."
            : err instanceof Error && err.message === PLACEHOLDER_CONFLICT_MESSAGE
              ? err.message
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
    report.documentType,
    onChange,
    replaceSection,
    setComments,
    refresh,
    comments,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
    trackChangesMode,
  ]);

  const dismissActive = useCallback(async () => {
    if (!activeComment || pending || !canResolve) return;

    setPending(true);
    try {
      beginSuggestionApplyTransition(section, activeComment.id, "dismiss");
      // Let the diff finish fading before the preview is torn down, so the
      // original text is never briefly revealed mid-animation.
      const [result] = await Promise.all([
        dismissSuggestion({
          reportId: report.id,
          section,
          comment: activeComment,
          sectionContent: sections[section] as Record<string, unknown>,
          fieldContentPath: contentPath,
        }),
        delay(SUGGESTION_DIFF_FADE_MS),
      ]);
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
      setComments((prev) => prev.filter((c) => c.id !== activeComment.id));
      setApplySettling(true);
      await delay(SUGGESTION_INLINE_REVEAL_DELAY_MS);

      toast.success("Suggestion dismissed");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof CommentPersistError || err instanceof SectionPersistError
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
    sections,
    contentPath,
    replaceSection,
    setComments,
    refresh,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  ]);

  const fieldAnchor = `${section}.${contentPath}`;

  return (
    <div className="space-y-1.5 scroll-mt-24">
      <Label>{label}</Label>
      <PlainTextHighlightedInput
        fieldAnchor={fieldAnchor}
        value={value}
        onChange={handleUserChange}
        suggestionPreviewHeld={
          isSuggestionPreviewHeld(section)
            ? suggestionApplyTransition[section]?.mode
            : undefined
        }
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        mirrorContent={mirrorContent}
        suggestionActive={showInlineSuggestion}
        suggestionWidgetAnchorRef={suggestionWidgetAnchorRef}
        inlineSuggestionWidget={
          showInlineSuggestion && activeComment ? (
            <SuggestionInlineActions
              suggestionId={activeComment.id}
              pending={pending}
              acceptDisabled={!canResolve || !activeValidation?.canApply}
              dismissDisabled={!canResolve}
              onAccept={() => void applyActive()}
              onDismiss={() => void dismissActive()}
            />
          ) : undefined
        }
        aria-label={label}
      />
    </div>
  );
}
