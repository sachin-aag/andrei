"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { resizeTextareaToContent } from "@/components/ui/auto-resize-textarea";
import { InlineSelectionCommentPopover } from "@/components/report/inline-selection-comment-popover";
import { fromPosFromPlaceholderId } from "@/lib/placeholders/find";
import { splitPlainTextWithPlaceholders } from "@/lib/placeholders/plain-text-segments";
import { PlainTextPlaceholderSpans } from "@/components/report/plain-text-placeholder-spans";
import {
  isExactPlaceholderSelection,
  placeholderSpanAtOffset,
} from "@/lib/plain-text/placeholder-at-offset";
import { getTextareaSelectionClientRect } from "@/lib/plain-text/textarea-selection-rect";
import {
  useReportComments,
  useReportData,
  useReportPlaceholders,
} from "@/providers/report-provider";
import { useUserDirectory } from "@/providers/user-directory-provider";
import type { SectionType } from "@/db/schema";
import { cn } from "@/lib/utils";

const fieldTypography =
  "px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words";

export function PlainTextHighlightedInput({
  value,
  onChange,
  disabled,
  className,
  placeholder,
  fieldAnchor,
  shellMinHeight,
  onEditLayoutHeight,
  mirrorContent,
  suggestionActive,
  inlineSuggestionWidget,
  suggestionWidgetAnchorRef,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  fieldAnchor: string;
  shellMinHeight?: number | null;
  /** Reports the laid-out edit surface height (for suggestion preview transitions). */
  onEditLayoutHeight?: (height: number) => void;
  /** When set, replaces default placeholder mirror (inline suggestion track-changes). */
  mirrorContent?: ReactNode;
  suggestionActive?: boolean;
  /** Accept/dismiss widget, positioned after the suggestion in the mirror layer. */
  inlineSuggestionWidget?: ReactNode;
  suggestionWidgetAnchorRef?: RefObject<HTMLSpanElement | null>;
  "aria-label"?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const { focusedPanelPlaceholderId } = useReportPlaceholders();
  const { report, workspaceMode, currentUserId, getSectionId } = useReportData();
  const { setComments, setActiveCommentId } = useReportComments();
  const { getUser } = useUserDirectory();
  const segments = useMemo(() => splitPlainTextWithPlaceholders(value), [value]);
  const hasPlaceholders = segments.some((s) => s.kind === "placeholder");
  const useMirrorOverlay = hasPlaceholders || mirrorContent != null;

  const fieldDot = fieldAnchor.indexOf(".");
  const fieldSection =
    fieldDot >= 0 ? (fieldAnchor.slice(0, fieldDot) as SectionType) : null;
  const fieldContentPath = fieldDot >= 0 ? fieldAnchor.slice(fieldDot + 1) : "";
  const focusedFromPos =
    fieldSection && fieldContentPath && focusedPanelPlaceholderId
      ? fromPosFromPlaceholderId(
          focusedPanelPlaceholderId,
          fieldSection,
          fieldContentPath
        )
      : null;

  const manager = getUser(currentUserId)?.role === "manager";
  const canInlineComment =
    !disabled &&
    fieldSection != null &&
    (report.status === "submitted" ||
      report.status === "in_review" ||
      report.status === "draft") &&
    (manager ? workspaceMode === "review" : currentUserId === report.authorId);

  const [commentComposing, setCommentComposing] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [pendingSel, setPendingSel] = useState<{ from: number; to: number } | null>(
    null
  );
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [posting, setPosting] = useState(false);
  const [suggestionWidgetPos, setSuggestionWidgetPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const syncSuggestionWidgetPosition = useCallback(() => {
    if (!inlineSuggestionWidget || !suggestionWidgetAnchorRef?.current || !shellRef.current) {
      setSuggestionWidgetPos(null);
      return;
    }
    const anchor = suggestionWidgetAnchorRef.current.getBoundingClientRect();
    const shell = shellRef.current.getBoundingClientRect();
    setSuggestionWidgetPos({
      top: anchor.top - shell.top,
      left: anchor.left - shell.left,
    });
  }, [inlineSuggestionWidget, suggestionWidgetAnchorRef]);

  const syncEditHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    resizeTextareaToContent(textarea);
    if (useMirrorOverlay) {
      const mirror = mirrorRef.current;
      if (mirror) {
        mirror.style.minHeight = `${textarea.offsetHeight}px`;
      }
    }
    onEditLayoutHeight?.(textarea.offsetHeight);
    syncSuggestionWidgetPosition();
  }, [useMirrorOverlay, onEditLayoutHeight, syncSuggestionWidgetPosition]);

  useLayoutEffect(() => {
    syncEditHeight();
    syncSuggestionWidgetPosition();
  }, [value, shellMinHeight, mirrorContent, syncEditHeight, syncSuggestionWidgetPosition]);

  const clearCommentUi = useCallback(() => {
    setCommentComposing(false);
    setCommentDraft("");
    setPendingSel(null);
    setSelectionRect(null);
  }, []);

  const refreshSelectionUi = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !canInlineComment) {
      clearCommentUi();
      return;
    }

    const { selectionStart, selectionEnd } = textarea;
    if (selectionStart === selectionEnd) {
      if (!commentComposing) clearCommentUi();
      return;
    }

    if (isExactPlaceholderSelection(value, selectionStart, selectionEnd)) {
      clearCommentUi();
      return;
    }

    const rect = getTextareaSelectionClientRect(textarea);
    if (!rect) {
      clearCommentUi();
      return;
    }

    setSelectionRect(rect);
    if (!commentComposing) {
      setPendingSel({ from: selectionStart, to: selectionEnd });
    }
  }, [canInlineComment, commentComposing, clearCommentUi, value]);

  const selectPlaceholderAtCursor = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return false;
    const span = placeholderSpanAtOffset(value, textarea.selectionStart);
    if (!span) return false;
    textarea.setSelectionRange(span.from, span.to);
    refreshSelectionUi();
    return true;
  }, [disabled, refreshSelectionUi, value]);

  const handleTextareaMouseUp = useCallback(() => {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      if (
        textarea.selectionStart === textarea.selectionEnd &&
        placeholderSpanAtOffset(value, textarea.selectionStart)
      ) {
        selectPlaceholderAtCursor();
        return;
      }
      refreshSelectionUi();
    });
  }, [refreshSelectionUi, selectPlaceholderAtCursor, value]);

  const handleTextareaDoubleClick = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (selectPlaceholderAtCursor()) return;
      refreshSelectionUi();
    });
  }, [refreshSelectionUi, selectPlaceholderAtCursor]);

  const postInlineComment = useCallback(async () => {
    if (!commentDraft.trim() || !pendingSel || !fieldSection) return;
    const sectionId = getSectionId(fieldSection);
    const anchorText = value.slice(pendingSel.from, pendingSel.to);
    setPosting(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentDraft.trim(),
          section: fieldSection,
          sectionId,
          contentPath: fieldContentPath,
          anchorText,
          fromPos: pendingSel.from,
          toPos: pendingSel.to,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to post comment");
        return;
      }
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setActiveCommentId(data.comment.id);
      clearCommentUi();
      toast.success("Comment added");
    } finally {
      setPosting(false);
    }
  }, [
    commentDraft,
    pendingSel,
    fieldSection,
    fieldContentPath,
    getSectionId,
    value,
    report.id,
    setComments,
    setActiveCommentId,
    clearCommentUi,
  ]);

  const lockedMinStyle =
    shellMinHeight != null ? { minHeight: shellMinHeight } : undefined;

  const showCommentPopover =
    canInlineComment &&
    selectionRect != null &&
    (commentComposing || pendingSel != null);

  const textareaProps = {
    "data-field-anchor": fieldAnchor,
    value,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      resizeTextareaToContent(e.currentTarget);
      onChange(e.target.value);
      onEditLayoutHeight?.(e.currentTarget.offsetHeight);
      const mirror = mirrorRef.current;
      if (mirror) {
        mirror.style.minHeight = `${e.currentTarget.offsetHeight}px`;
      }
    },
    onSelect: refreshSelectionUi,
    onKeyUp: refreshSelectionUi,
    onMouseUp: handleTextareaMouseUp,
    onDoubleClick: handleTextareaDoubleClick,
    onBlur: () => {
      if (!commentComposing) {
        window.setTimeout(() => clearCommentUi(), 150);
      }
    },
    disabled,
    placeholder,
    "aria-label": ariaLabel,
  };

  if (!useMirrorOverlay) {
    return (
      <div ref={shellRef} className="relative">
        <Textarea
          ref={textareaRef}
          {...textareaProps}
          className={cn(
            "text-sm leading-relaxed resize-none overflow-hidden",
            className
          )}
          style={lockedMinStyle}
        />
        {showCommentPopover ? (
          <InlineSelectionCommentPopover
            anchorRect={selectionRect}
            composing={commentComposing}
            draft={commentDraft}
            posting={posting}
            onDraftChange={setCommentDraft}
            onStartCompose={() => setCommentComposing(true)}
            onCancel={clearCommentUi}
            onPost={() => void postInlineComment()}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={cn(
        "relative grid",
        className,
        suggestionActive &&
          "rounded-md ring-1 ring-violet-400/20 border border-violet-500/35"
      )}
      style={lockedMinStyle}
    >
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          "pointer-events-none col-start-1 row-start-1 rounded-md border border-transparent bg-[var(--input)] shadow-sm",
          fieldTypography
        )}
      >
        {mirrorContent ?? (
          <PlainTextPlaceholderSpans
            text={value}
            focusedFromPos={focusedFromPos}
          />
        )}
      </div>
      <Textarea
        ref={textareaRef}
        {...textareaProps}
        className={cn(
          "col-start-1 row-start-1 resize-none overflow-hidden bg-transparent text-transparent caret-[var(--foreground)] selection:bg-primary/20 selection:text-transparent",
          fieldTypography
        )}
        style={{ WebkitTextFillColor: "transparent" } as React.CSSProperties}
      />
      {inlineSuggestionWidget && suggestionWidgetPos ? (
        <div
          className="pointer-events-auto absolute z-10"
          style={{
            top: suggestionWidgetPos.top,
            left: suggestionWidgetPos.left,
          }}
        >
          {inlineSuggestionWidget}
        </div>
      ) : null}
      {showCommentPopover ? (
        <InlineSelectionCommentPopover
          anchorRect={selectionRect}
          composing={commentComposing}
          draft={commentDraft}
          posting={posting}
          onDraftChange={setCommentDraft}
          onStartCompose={() => setCommentComposing(true)}
          onCancel={clearCommentUi}
          onPost={() => void postInlineComment()}
        />
      ) : null}
    </div>
  );
}
