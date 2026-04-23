"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Content, JSONContent } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus, Check, X } from "lucide-react";
import { useReport } from "@/providers/report-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getUser } from "@/lib/auth/mock-users";
import { cn } from "@/lib/utils";
import { stripSuggestionMarksFromDoc } from "@/lib/tiptap/rich-text";
import { createCommentHighlightExtension } from "@/lib/tiptap/comment-highlights";
import type { CommentHighlightRange } from "@/lib/tiptap/comment-highlights";
import {
  SuggestionInsert,
  SuggestionDelete,
  TrackChangesExtension,
  TrackChangesKeyboardExtension,
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import type { SectionType } from "@/db/schema";

export type TiptapSectionFieldProps = {
  section: SectionType;
  contentPath: string;
  label: string;
  placeholder?: string;
  className?: string;
  value: JSONContent;
  onChange: (doc: JSONContent) => void;
  /** Persist immediately after accept/reject suggestion (autosave flush). */
  onFlushSave?: () => void | Promise<void>;
};

export function TiptapSectionField({
  section,
  contentPath,
  label,
  placeholder = "Write here…",
  className,
  value,
  onChange,
  onFlushSave,
}: TiptapSectionFieldProps) {
  const {
    report,
    comments,
    setComments,
    readOnly,
    trackChangesMode,
    workspaceMode,
    currentUserId,
    getSectionId,
    activeCommentId,
    setActiveCommentId,
    pendingCommentFocusCommentId,
    acknowledgeCommentFocus,
    registerEditor,
  } = useReport();

  const rangesRef = useRef<CommentHighlightRange[]>([]);
  const handlersRef = useRef<{ onCommentActivate: (id: string) => void }>({
    onCommentActivate: () => {},
  });
  const highlightExtension = useMemo(
    () =>
      createCommentHighlightExtension(
        () => rangesRef.current,
        () => handlersRef.current
      ),
    []
  );

  const filteredRanges = useMemo(() => {
    return comments
      .filter(
        (c) =>
          !c.parentId &&
          c.section === section &&
          c.contentPath === contentPath &&
          c.fromPos != null &&
          c.toPos != null
      )
      .map((c) => ({
        id: c.id,
        from: c.fromPos!,
        to: c.toPos!,
        resolved: c.status === "resolved",
        active: activeCommentId === c.id,
      }));
  }, [comments, section, contentPath, activeCommentId]);

  rangesRef.current = filteredRanges;

  /** Engineer authoring a draft must never persist or show suggestion-insert styling — unless track changes is on. */
  const shouldStripSuggestionMarks = useMemo(() => {
    if (trackChangesMode) return false;
    if (report.status !== "draft") return false;
    if (currentUserId !== report.authorId) return false;
    return getUser(currentUserId)?.role === "engineer";
  }, [trackChangesMode, report.status, report.authorId, currentUserId]);

  const shouldStripRef = useRef(shouldStripSuggestionMarks);
  shouldStripRef.current = shouldStripSuggestionMarks;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editable = !readOnly || trackChangesMode;
  const manager = getUser(currentUserId)?.role === "manager";
  const canInlineComment =
    workspaceMode === "review" && manager && (report.status === "submitted" || report.status === "in_review");
  const canResolveSuggestions = !readOnly && !trackChangesMode;

  const [commentComposing, setCommentComposing] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [pendingSel, setPendingSel] = useState<{ from: number; to: number } | null>(null);
  const [posting, setPosting] = useState(false);
  const [, bump] = useState(0);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: false,
        }),
        Placeholder.configure({ placeholder }),
        SuggestionInsert,
        SuggestionDelete,
        TrackChangesKeyboardExtension,
        TrackChangesExtension,
        highlightExtension,
      ],
      content: value,
      editable,
      onUpdate: ({ editor: ed }) => {
        let json = ed.getJSON() as JSONContent;
        if (shouldStripRef.current) {
          const stripped = stripSuggestionMarksFromDoc(json);
          if (JSON.stringify(stripped) !== JSON.stringify(json)) {
            ed.commands.setContent(stripped as Content, { emitUpdate: false });
            json = stripped;
          }
        }
        // Do not use flushSync here: onUpdate can run during useEffect (e.g. setContent sync), and React 19 forbids flushSync inside lifecycle methods.
        onChangeRef.current(json);
      },
      onSelectionUpdate: () => bump((n) => n + 1),
    },
    [highlightExtension, placeholder]
  );

  handlersRef.current = {
    onCommentActivate: (id: string) => {
      setActiveCommentId(id);
      const c = comments.find((x) => x.id === id && !x.parentId);
      if (!c || c.fromPos == null || c.toPos == null) return;
      if (!editor) return;
      editor.chain().focus().setTextSelection({ from: c.fromPos, to: c.toPos }).run();
    },
  };

  useEffect(() => {
    if (!editor || !pendingCommentFocusCommentId) return;
    const root = comments.find(
      (c) => c.id === pendingCommentFocusCommentId && !c.parentId
    );
    if (!root || root.section !== section || root.contentPath !== contentPath) return;
    if (root.fromPos == null || root.toPos == null) {
      acknowledgeCommentFocus();
      return;
    }
    editor.chain().focus().setTextSelection({ from: root.fromPos, to: root.toPos }).run();
    acknowledgeCommentFocus();
  }, [
    editor,
    pendingCommentFocusCommentId,
    comments,
    section,
    contentPath,
    acknowledgeCommentFocus,
  ]);

  useEffect(() => {
    if (!editor) return;
    const s = editor.storage.trackChanges as { enabled: boolean; authorId: string } | undefined;
    if (s) {
      s.enabled = trackChangesMode === true;
      s.authorId = currentUserId;
    }
  }, [editor, trackChangesMode, currentUserId]);

  useEffect(() => {
    if (!editor) return;
    const unregister = registerEditor(section, contentPath, editor);
    return unregister;
  }, [editor, registerEditor, section, contentPath]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  /** Keep deps length stable (2) for Fast Refresh — React 19 warns if the same hook’s dep array changes size. */
  const applyExternalValueToEditor = useCallback(() => {
    if (!editor) return;
    const strip = shouldStripRef.current;
    const nextDoc = strip ? stripSuggestionMarksFromDoc(value) : value;
    const cur = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(nextDoc);
    if (cur !== next) {
      editor.commands.setContent(nextDoc as Content, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    applyExternalValueToEditor();
  }, [applyExternalValueToEditor, shouldStripSuggestionMarks]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr.setMeta("commentRefresh", true).setMeta("addToHistory", false)
    );
  }, [editor, activeCommentId, filteredRanges]);

  const cancelCommentCompose = useCallback(() => {
    setCommentComposing(false);
    setCommentDraft("");
    setPendingSel(null);
  }, []);

  const postInlineComment = async () => {
    if (!commentDraft.trim() || !pendingSel) return;
    const sectionId = getSectionId(section);
    const anchorText = editor?.state.doc.textBetween(pendingSel.from, pendingSel.to, " ") ?? "";
    setPosting(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentDraft.trim(),
          section,
          sectionId,
          contentPath,
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
      setCommentComposing(false);
      setPendingSel(null);
      toast.success("Comment added");
    } finally {
      setPosting(false);
    }
  };

  const acceptInsertion = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange(suggestionInsertMarkName).unsetMark(suggestionInsertMarkName).run();
    queueMicrotask(() => {
      void onFlushSave?.();
    });
  }, [editor, onFlushSave]);

  const rejectInsertion = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().deleteSelection().run();
    queueMicrotask(() => {
      void onFlushSave?.();
    });
  }, [editor, onFlushSave]);

  const acceptDeletion = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange(suggestionDeleteMarkName).deleteSelection().run();
    queueMicrotask(() => {
      void onFlushSave?.();
    });
  }, [editor, onFlushSave]);

  const rejectDeletion = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange(suggestionDeleteMarkName).unsetMark(suggestionDeleteMarkName).run();
    queueMicrotask(() => {
      void onFlushSave?.();
    });
  }, [editor, onFlushSave]);

  const selectionHasInsert = editor?.isActive(suggestionInsertMarkName);
  const selectionHasDelete = editor?.isActive(suggestionDeleteMarkName);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <Label>{label}</Label>
        <div className="flex flex-wrap gap-1 items-center">
          {canResolveSuggestions && selectionHasInsert && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={acceptInsertion}>
                <Check className="size-3" />
                Accept insert
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={rejectInsertion}>
                <X className="size-3" />
                Reject insert
              </Button>
            </>
          )}
          {canResolveSuggestions && selectionHasDelete && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={acceptDeletion}>
                <Check className="size-3" />
                Accept delete
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={rejectDeletion}>
                <X className="size-3" />
                Reject delete
              </Button>
            </>
          )}
        </div>
      </div>

      {editor && (
        <BubbleMenu
          editor={editor}
          options={{
            placement: "right-end",
            offset: 10,
            flip: true,
            shift: { padding: 8 },
          }}
          shouldShow={({ editor: ed, state }) => {
            if (!canInlineComment || !ed.isEditable) return false;
            if (commentComposing) return true;
            return !state.selection.empty;
          }}
        >
          <div
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg z-50"
            onMouseDown={(e) => e.preventDefault()}
          >
            {!commentComposing ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (!editor) return;
                  const { from, to } = editor.state.selection;
                  if (from === to) return;
                  setPendingSel({ from, to });
                  setCommentDraft("");
                  setCommentComposing(true);
                }}
              >
                <MessageSquarePlus className="size-3" />
                Comment on selection
              </Button>
            ) : (
              <div className="flex flex-col gap-2 w-[min(280px,calc(100vw-2rem))]">
                <span className="text-xs font-medium text-[var(--foreground)]">
                  Comment
                </span>
                <Textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Write your comment…"
                  className="min-h-[72px] text-sm bg-[var(--input)] resize-y"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cancelCommentCompose}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={postInlineComment}
                    disabled={posting || !commentDraft.trim()}
                  >
                    {posting ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      "Post"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </BubbleMenu>
      )}

      <div
        className={cn(
          "rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 min-h-[200px] text-sm leading-relaxed focus-within:ring-2 focus-within:ring-[var(--ring)]",
          "[&_.ProseMirror]:min-h-[180px] [&_.ProseMirror]:outline-none",
          !editable && "opacity-90"
        )}
      >
        {editor ? <EditorContent editor={editor} /> : null}
      </div>

    </div>
  );
}
