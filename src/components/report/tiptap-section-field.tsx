"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Content, JSONContent, Editor } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { BulletListWithStyle } from "@/lib/tiptap/bullet-list-with-style";
import { ImageInline } from "@/lib/tiptap/image-inline";
import { MathBlock, MathInline } from "@/lib/tiptap/math-nodes";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCellWithVerticalAlign, TableHeaderWithVerticalAlign } from "@/lib/tiptap/table-cell-vertical-align";
import { TableWithColumnWidths } from "@/lib/tiptap/table-column-widths";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquarePlus,
  Plus,
  Minus,
  Trash2,
  ToggleLeft,
  Columns3,
  Rows3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUpToLine,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
} from "lucide-react";
import { isBulkSuggestionApply } from "@/lib/suggestions/apply-transition";
import {
  useReportComments,
  useReportData,
  useReportEditors,
  useReportEvaluations,
  useReportPlaceholders,
  useReportSections,
} from "@/providers/report-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUserDirectory } from "@/providers/user-directory-provider";
import { cn } from "@/lib/utils";
import { createCommentHighlightExtension } from "@/lib/tiptap/comment-highlights";
import type { CommentHighlightRange, CommentHighlightHandlers } from "@/lib/tiptap/comment-highlights";
import { createCitationHighlightExtension } from "@/lib/tiptap/citation-highlights";
import {
  createPlaceholderHighlightExtension,
  isSelectionOverPlaceholder,
  placeholderRefreshMeta,
} from "@/lib/tiptap/placeholder-highlights";
import {
  SuggestionInsert,
  SuggestionDelete,
  TrackChangesExtension,
  TrackChangesKeyboardExtension,
} from "@/lib/tiptap/suggestion-marks";
import {
  createSuggestionActionWidgetsExtension,
  suggestionActionWidgetsRefreshMeta,
  type SuggestionActionWidgetState,
} from "@/lib/tiptap/suggestion-action-widgets";
import {
  injectSuggestionMarks,
  richDocsMatchIgnoringAiPreview,
  shouldApplyExternalValueToEditor,
  shouldSkipSuggestionDocSync,
  stripPendingSuggestionsExcept,
} from "@/lib/tiptap/suggestion-inject";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  isAiSuggestionKind,
  parseAiFixCommentContent,
  parseAiRedraftCommentContent,
} from "@/lib/ai/suggestion-gating";
import { buildInactiveSuggestionCss } from "@/lib/tiptap/inactive-suggestion-css";
import { buildRedraftPreviewDoc } from "@/lib/tiptap/redraft-preview";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { normalizeRichField } from "@/lib/tiptap/rich-text";
import {
  citationsAtEndOfSectionFor,
  editorProfileFor,
  getDocumentType,
  suggestionApplyModeFor,
} from "@/lib/document-types";
import { afterPaint } from "@/lib/suggestions/apply-transition";
import { buildSuggestionEdit, narrativeHasSuggestionMarks } from "@/lib/suggestions/apply-narrative-suggestion";
import {
  acceptSuggestion,
  dismissSuggestion,
  CommentPersistError,
  SectionPersistError,
} from "@/lib/suggestions/accept-suggestion";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { suggestionTargetsField } from "@/lib/suggestions/resolve-suggestion-field-path";
import { validateSuggestionLocate } from "@/lib/suggestions/validate-suggestion";
import { buildTableOperationPreviewDoc } from "@/lib/suggestions/table-preview";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { editorRegistryKey } from "@/providers/report-provider";
import { isTrackChangesFieldEditable } from "@/lib/reports/section-save-policy";
import type { SectionType } from "@/db/schema";
import { TiptapEditorContextMenu } from "@/components/report/tiptap-editor-context-menu";

const GENERIC_RICH_FIELD_OPTIONS = { preserveHeadings: true } as const;
const GENERIC_MARKDOWN_OPTIONS = { headingNodes: true } as const;

function TableEditToolbar({
  editor,
  tableHAlign,
  tableVAlign,
}: {
  editor: Editor;
  tableHAlign: string | null;
  tableVAlign: string | null;
}) {
  return (
    <div
      className="flex max-w-[min(100vw-1.5rem,36rem)] flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 shadow-md"
      onMouseDown={(e) => e.preventDefault()}
    >
      <span className="w-full px-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] sm:w-auto sm:pr-1">
        Table
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs gap-1"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
        title="Add column before"
      >
        <Columns3 className="size-3" />
        <Plus className="size-2.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs gap-1"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title="Add column after"
      >
        <Plus className="size-2.5" />
        <Columns3 className="size-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs gap-1"
        onClick={() => editor.chain().focus().addRowBefore().run()}
        title="Add row before"
      >
        <Rows3 className="size-3" />
        <Plus className="size-2.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs gap-1"
        onClick={() => editor.chain().focus().addRowAfter().run()}
        title="Add row after"
      >
        <Plus className="size-2.5" />
        <Rows3 className="size-3" />
      </Button>
      <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs gap-1"
        onClick={() => editor.chain().focus().deleteColumn().run()}
        title="Delete column"
      >
        <Columns3 className="size-3" />
        <Minus className="size-2.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs gap-1"
        onClick={() => editor.chain().focus().deleteRow().run()}
        title="Delete row"
      >
        <Rows3 className="size-3" />
        <Minus className="size-2.5" />
      </Button>
      <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs gap-1"
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        title="Toggle header row"
      >
        <ToggleLeft className="size-3" />
        Header
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs gap-1 text-[var(--destructive)]"
        onClick={() => editor.chain().focus().deleteTable().run()}
        title="Delete table"
      >
        <Trash2 className="size-3" />
        Delete
      </Button>
      <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-6 px-1.5",
          tableHAlign === "left" && "bg-brand-100 text-foreground"
        )}
        onClick={() => editor.chain().focus().setCellAttribute("align", "left").run()}
        title="Align cell left"
      >
        <AlignLeft className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-6 px-1.5", tableHAlign === "center" && "bg-brand-100 text-foreground")}
        onClick={() => editor.chain().focus().setCellAttribute("align", "center").run()}
        title="Align cell center"
      >
        <AlignCenter className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-6 px-1.5", tableHAlign === "right" && "bg-brand-100 text-foreground")}
        onClick={() => editor.chain().focus().setCellAttribute("align", "right").run()}
        title="Align cell right"
      >
        <AlignRight className="size-3.5" />
      </Button>
      <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-6 px-1.5", tableVAlign === "top" && "bg-brand-100 text-foreground")}
        onClick={() => editor.chain().focus().setCellAttribute("verticalAlign", "top").run()}
        title="Align cell top"
      >
        <ArrowUpToLine className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-6 px-1.5", tableVAlign === "middle" && "bg-brand-100 text-foreground")}
        onClick={() => editor.chain().focus().setCellAttribute("verticalAlign", "middle").run()}
        title="Align cell middle"
      >
        <AlignVerticalJustifyCenter className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-6 px-1.5", tableVAlign === "bottom" && "bg-brand-100 text-foreground")}
        onClick={() => editor.chain().focus().setCellAttribute("verticalAlign", "bottom").run()}
        title="Align cell bottom"
      >
        <ArrowDownToLine className="size-3.5" />
      </Button>
    </div>
  );
}

export type TiptapSectionFieldProps = {
  section: SectionType;
  contentPath: string;
  /** Omit to hide the uppercase field label (paged documents). */
  label?: string;
  placeholder?: string;
  className?: string;
  value: JSONContent;
  onChange: (doc: JSONContent) => void;
  /** Persist immediately after accept/reject suggestion (autosave flush). */
  onFlushSave?: () => void | Promise<void>;
  /** When true, the field stays read-only even with track changes on. */
  locked?: boolean;
  /** Shrink the editor chrome for read-only blocks (e.g. signature tables). */
  compact?: boolean;
  /** `page` is a Letter-sized surface without the boxed input chrome. */
  chrome?: "input" | "page";
};

export function TiptapSectionField({
  section,
  contentPath,
  label,
  placeholder = "Write here…",
  className,
  value,
  onChange,
  locked = false,
  compact = false,
  chrome = "input",
}: TiptapSectionFieldProps) {
  const {
    report,
    readOnly,
    trackChangesMode,
    workspaceMode,
    currentUserId,
    getSectionId,
    refresh,
  } = useReportData();
  const {
    comments,
    setComments,
    activeCommentId,
    setActiveCommentId,
    setActiveAnchorId,
    hoveredCommentIds,
    setHoveredCommentIds,
    clearHoveredCommentIds,
    pendingCommentFocusCommentId,
    acknowledgeCommentFocus,
  } = useReportComments();
  const { focusedPanelPlaceholderId } = useReportPlaceholders();
  const focusedPanelPlaceholderIdRef = useRef(focusedPanelPlaceholderId);
  useEffect(() => {
    focusedPanelPlaceholderIdRef.current = focusedPanelPlaceholderId;
  }, [focusedPanelPlaceholderId]);
  const { registerEditor, setActiveEditor, activeEditorKey } = useReportEditors();
  const isRichField = isRichTargetField(section, contentPath);
  const thisEditorKey = editorRegistryKey(section, contentPath);
  const {
    activeSuggestionIdForSection,
    isSuggestionPreviewHeld,
    suggestionApplyTransition,
    beginSuggestionApplyTransition,
    endSuggestionApplyTransition,
  } = useReportEvaluations();
  const { replaceSection, sections } = useReportSections();
  const { getUser } = useUserDirectory();
  const activeSuggestionId = activeSuggestionIdForSection(section);
  const suggestionWidgetStateRef = useRef<SuggestionActionWidgetState>({
    enabled: true,
    actionableEvaluationIds: new Set<string>(),
    pendingId: null as string | null,
    onAccept: () => {},
    onIgnore: () => {},
  });
  const tablePreviewSuggestionIdRef = useRef<string | null>(null);

  const rangesRef = useRef<CommentHighlightRange[]>([]);
  const handlersRef = useRef<CommentHighlightHandlers>({
    onCommentActivate: () => {},
    onCommentHover: () => {},
    onCommentDeactivate: () => {},
    onAiSuggestionMarkActivate: () => {},
  });

  const getRanges = useCallback(() => rangesRef.current, []);
  const getHandlers = useCallback(() => handlersRef.current, []);

  const highlightExtension = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- ProseMirror calls getters at transaction time, not during render
      createCommentHighlightExtension(getRanges, getHandlers),
    [getRanges, getHandlers]
  );

  const suggestionWidgetsExtension = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- ProseMirror reads this getter from plugin callbacks, not during React render
      createSuggestionActionWidgetsExtension(() => suggestionWidgetStateRef.current),
    []
  );

  // Keep this extension identity stable. `useEditor` rebuilds the whole
  // ProseMirror view when an extension object changes; doing that on panel
  // fill-input focus leaves a ghost caret (input looks focused, keys go
  // nowhere). Decorations refresh via `placeholderRefreshMeta` below.
  const placeholderHighlightExtension = useMemo(
    () =>
      createPlaceholderHighlightExtension(
        // eslint-disable-next-line react-hooks/refs -- ProseMirror calls this getter on refresh, not during render
        () => focusedPanelPlaceholderIdRef.current,
        { section, contentPath }
      ),
    [section, contentPath]
  );

  const citationsAtEndOfSection = citationsAtEndOfSectionFor(report.documentType);
  const citationHighlightExtension = useMemo(
    () => (citationsAtEndOfSection ? createCitationHighlightExtension() : null),
    [citationsAtEndOfSection]
  );

  const filteredRanges = useMemo(() => {
    return comments
      .filter(
        (c) =>
          !c.parentId &&
          !isAiSuggestionKind(c.kind) &&
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
        hovered: hoveredCommentIds.includes(c.id),
        ai: c.kind?.startsWith("ai_") ?? false,
      }));
  }, [comments, section, contentPath, activeCommentId, hoveredCommentIds]);

  useLayoutEffect(() => {
    rangesRef.current = filteredRanges;
  }, [filteredRanges]);

  // Track-changes toggle controls *capture of new edits* only. Existing
  // suggestion marks (from prior typing while TC was on, or from AI fixes
  // injected server-side) stay visible regardless of the toggle, until the
  // author explicitly accepts or ignores them. Stripping them on toggle-off
  // would silently destroy reviewer intent.
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editable = isTrackChangesFieldEditable({
    locked,
    readOnly,
    trackChangesMode,
  });
  const manager = getUser(currentUserId)?.role === "manager";
  const canInlineComment =
    (report.status === "submitted" || report.status === "in_review" || report.status === "draft") &&
    (manager ? workspaceMode === "review" : currentUserId === report.authorId);

  const [commentComposing, setCommentComposing] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [pendingSel, setPendingSel] = useState<{ from: number; to: number } | null>(null);
  const [posting, setPosting] = useState(false);
  const headingEnabled =
    editorProfileFor(getDocumentType(report.documentType)) === "generic_document";
  const suggestionPersistMode = suggestionApplyModeFor(
    getDocumentType(report.documentType)
  );
  const richFieldOptions = headingEnabled
    ? GENERIC_RICH_FIELD_OPTIONS
    : undefined;
  const markdownOptions = headingEnabled
    ? GENERIC_MARKDOWN_OPTIONS
    : undefined;

  const editor = useEditor(
    {
      immediatelyRender: false,
      autofocus: false,
      extensions: [
        StarterKit.configure({
          heading: headingEnabled ? { levels: [1, 2, 3] } : false,
          bulletList: false,
        }),
        BulletListWithStyle,
        Subscript,
        Superscript,
        TextStyle,
        Color,
        ImageInline,
        MathInline,
        MathBlock,
        Placeholder.configure({ placeholder }),
        TableWithColumnWidths.configure({ resizable: false }),
        TableRow,
        TableCellWithVerticalAlign,
        TableHeaderWithVerticalAlign,
        SuggestionInsert,
        SuggestionDelete,
        TrackChangesKeyboardExtension,
        TrackChangesExtension,
        highlightExtension,
        suggestionWidgetsExtension,
        placeholderHighlightExtension,
        ...(citationHighlightExtension ? [citationHighlightExtension] : []),
      ],
      content: normalizeRichField(value, richFieldOptions),
      editable,
      onUpdate: ({ editor: ed }) => {
        const json = ed.getJSON() as JSONContent;
        // Do not use flushSync here: onUpdate can run during useEffect (e.g. setContent sync), and React 19 forbids flushSync inside lifecycle methods.
        onChangeRef.current(json);
      },
    },
    [highlightExtension, placeholder, placeholderHighlightExtension, citationHighlightExtension, suggestionWidgetsExtension]
  );


  useLayoutEffect(() => {
    handlersRef.current = {
      onCommentActivate: (id: string) => {
        setActiveCommentId(id);
        setActiveAnchorId(id);
        const c = comments.find((x) => x.id === id && !x.parentId);
        if (!c || c.fromPos == null || c.toPos == null) return;
        if (c.kind?.startsWith("ai_")) return;
        if (!editor) return;
        editor.chain().focus().setTextSelection({ from: c.fromPos, to: c.toPos }).run();
      },
      onAiSuggestionMarkActivate: (suggestionId: string) => {
        const c = comments.find((x) => !x.parentId && x.id === suggestionId);
        if (!c) return;
        setActiveCommentId(c.id);
        setActiveAnchorId(c.id);
      },
      onCommentHover: (ids: string[]) => {
        if (ids.length === 0) {
          clearHoveredCommentIds();
        } else {
          setHoveredCommentIds(ids);
        }
      },
      onCommentDeactivate: () => {
        setActiveCommentId(null);
        setActiveAnchorId(null);
      },
    };
  }, [
    editor,
    comments,
    setActiveCommentId,
    setActiveAnchorId,
    setHoveredCommentIds,
    clearHoveredCommentIds,
  ]);

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

    // Trigger pulse animation on the freshly-focused highlight.
    requestAnimationFrame(() => {
      const el = editor.view.dom.querySelector(
        `.comment-highlight-active[data-comment-id="${root.id}"]`
      );
      if (el) {
        el.classList.remove("comment-highlight-pulse");
        void (el as HTMLElement).offsetWidth;
        el.classList.add("comment-highlight-pulse");
      }
    });
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
      // TipTap extension storage is intentionally mutable configuration.
      // eslint-disable-next-line react-hooks/immutability -- TipTap mutates extension storage for runtime toggles
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
    if (!editor || !editable) return;
    const onFocus = () => setActiveEditor(section, contentPath);
    editor.on("focus", onFocus);
    return () => {
      editor.off("focus", onFocus);
    };
  }, [editor, editable, section, contentPath, setActiveEditor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  const applySuggestionInEditorRef = useRef<
    (suggestionId: string, mode: "accept" | "dismiss") => Promise<void>
  >(async () => {});

  const applySuggestionInEditor = useCallback(
    async (suggestionId: string, mode: "accept" | "dismiss") => {
      const comment = comments.find((c) => c.id === suggestionId);
      if (!comment) throw new Error("Suggestion not found");

      beginSuggestionApplyTransition(section, suggestionId, mode);

      try {
        const currentSection = sections[section] as Record<string, unknown>;
        const result =
          mode === "accept"
            ? await acceptSuggestion({
                reportId: report.id,
                section,
                comment,
                sectionContent: currentSection,
                fieldContentPath: contentPath,
                applyMode: suggestionPersistMode,
              })
            : await dismissSuggestion({
                reportId: report.id,
                section,
                comment,
                sectionContent: currentSection,
                fieldContentPath: contentPath,
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
                : new SectionPersistError(0, "Save failed")
            );
          }
          throw new Error("Suggestion could not be located");
        }

        // Paint the applied result immediately. External-value sync skips a
        // focused editor, and the preview-strip effect would otherwise revert
        // pending AI marks once the comment is no longer the active suggestion.
        if (result.nextSection) {
          replaceSection(
            section,
            result.nextSection as unknown
          );
          if (editor && !editor.isDestroyed && isRichField) {
            editor.commands.setContent(
              getRichFieldValue(
                result.nextSection,
                contentPath,
                richFieldOptions
              ) as Content,
              { emitUpdate: false }
            );
          }
        }
        setComments((prev) =>
          mode === "dismiss"
            ? prev.filter((c) => c.id !== suggestionId)
            : prev.map((c) =>
                c.id === suggestionId ? { ...c, status: "resolved" as const } : c
              )
        );
        // Let the accepted/dismissed value paint while preview-held is still on,
        // otherwise ending the lock in the same tick re-strips the preview.
        await afterPaint();
      } finally {
        endSuggestionApplyTransition(section);
      }
    },
    [
      comments,
      report.id,
      section,
      contentPath,
      sections,
      replaceSection,
      setComments,
      suggestionPersistMode,
      editor,
      isRichField,
      richFieldOptions,
      beginSuggestionApplyTransition,
      endSuggestionApplyTransition,
    ]
  );

  useLayoutEffect(() => {
    applySuggestionInEditorRef.current = applySuggestionInEditor;
  }, [applySuggestionInEditor]);

  useEffect(() => {
    const ids = new Set<string>();
    if (activeSuggestionId) ids.add(activeSuggestionId);
    suggestionWidgetStateRef.current = {
      enabled: isRichField,
      actionableEvaluationIds: ids,
      pendingId: suggestionWidgetStateRef.current.pendingId,
      onAccept: async (id) => {
        suggestionWidgetStateRef.current.pendingId = id;
        editor?.view.dispatch(
          editor.state.tr.setMeta(suggestionActionWidgetsRefreshMeta, true)
        );
        try {
          await applySuggestionInEditorRef.current(id, "accept");
        } catch (err) {
          console.error(err);
          toast.error(
            err instanceof CommentPersistError ||
              err instanceof SectionPersistError
              ? err.message
              : "Could not apply suggestion"
          );
          await refresh();
        } finally {
          suggestionWidgetStateRef.current.pendingId = null;
          editor?.view.dispatch(
            editor.state.tr.setMeta(suggestionActionWidgetsRefreshMeta, true)
          );
        }
      },
      onIgnore: async (id) => {
        suggestionWidgetStateRef.current.pendingId = id;
        editor?.view.dispatch(
          editor.state.tr.setMeta(suggestionActionWidgetsRefreshMeta, true)
        );
        try {
          await applySuggestionInEditorRef.current(id, "dismiss");
        } catch (err) {
          console.error(err);
          toast.error(
            err instanceof CommentPersistError ||
              err instanceof SectionPersistError
              ? err.message
              : "Could not dismiss suggestion"
          );
          await refresh();
        } finally {
          suggestionWidgetStateRef.current.pendingId = null;
          editor?.view.dispatch(
            editor.state.tr.setMeta(suggestionActionWidgetsRefreshMeta, true)
          );
        }
      },
    };
    editor?.view.dispatch(
      editor.state.tr.setMeta(suggestionActionWidgetsRefreshMeta, true)
    );
    // Do not depend on applySuggestionInEditor — it changes on every section
    // keystroke (sections in its closure) and a widget refresh here remounts
    // the contenteditable=false accept/ignore island, which steals the caret.
  }, [activeSuggestionId, isRichField, editor, refresh]);

  const lastPersistedJsonRef = useRef<string | null>(null);

  const applyExternalValueToEditor = useCallback(() => {
    const currentEditor = editor;
    if (!currentEditor || currentEditor.isDestroyed) return;
    const incoming = normalizeRichField(value, richFieldOptions);
    const incomingJson = JSON.stringify(incoming);
    const prevPersisted = lastPersistedJsonRef.current;
    lastPersistedJsonRef.current = incomingJson;
    const current = currentEditor.getJSON() as JSONContent;
    // Keystrokes update the editor first; parent state catches up via onUpdate.
    // Replacing the doc while focused jumps the viewport (and can land the
    // caret in a later AI suggestion span). Suggestion accept still applies
    // once the persisted value changes — not when the preview-held lock
    // first flips, which would wipe the live preview with the old snapshot.
    if (
      !shouldApplyExternalValueToEditor({
        previewHeld: isSuggestionPreviewHeld(section),
        persistedChanged:
          prevPersisted !== null && prevPersisted !== incomingJson,
        hasFocus: currentEditor.view.hasFocus(),
        docsMatchIgnoringPreview: richDocsMatchIgnoringAiPreview(
          current,
          incoming
        ),
      })
    ) {
      return;
    }
    currentEditor.commands.setContent(incoming as Content, { emitUpdate: false });
  }, [editor, value, isSuggestionPreviewHeld, section, richFieldOptions]);

  useEffect(() => {
    applyExternalValueToEditor();
  }, [applyExternalValueToEditor]);

  const richContentKey = isRichField ? JSON.stringify(value) : "";

  const previewHeld = isRichField && isSuggestionPreviewHeld(section);
  const previewHeldMode = previewHeld
    ? suggestionApplyTransition[section]?.mode
    : undefined;

  // Narrow deps to this section only — avoid re-running when other sections change.
  const sectionContent = sections[section];

  /** Only the active suggestion may have inline marks; inject it when missing. */
  useEffect(() => {
    if (!editor || !isRichField) return;

    let json = editor.getJSON() as JSONContent;
    const canonicalJson = normalizeRichField(value, richFieldOptions) as JSONContent;
    const before = JSON.stringify(json);

    if (
      shouldSkipSuggestionDocSync({
        hasFocus: editor.view.hasFocus(),
        previewHeld,
        needsInject: Boolean(
          activeSuggestionId &&
            !narrativeHasSuggestionMarks(json, activeSuggestionId)
        ),
        hasLocalEdits: !richDocsMatchIgnoringAiPreview(json, canonicalJson),
      })
    ) {
      return;
    }

    if (previewHeld) {
      // Queue bridge: don't keep the previous suggestion marks and don't inject
      // the next one until the user jumps to it or dismisses the handoff.
      // Bulk apply/dismiss: strip every preview. The single-card accept
      // animation (red strikethrough through the green insert) must not play,
      // and comments stay "open" until the whole report batch finishes — if
      // we re-injected the first card onto already-applied text, overlapping
      // deletes would paint red across the new green run.
      if (suggestionApplyTransition[section]?.bridge) {
        json = stripPendingSuggestionsExcept(json, null);
        if (JSON.stringify(json) === before) return;
        editor.commands.setContent(json as Content, { emitUpdate: false });
        return;
      }
      if (isBulkSuggestionApply(suggestionApplyTransition[section]?.mode)) {
        // Keep the live insert/delete marks. Stripping them (or CSS-hiding
        // the insert run) removes the wording until the PATCH returns.
        // Do not inject — comments stay "open" for the whole report batch.
        return;
      }
      // Keep showing the suggestion currently being applied/dismissed as-is —
      // stripping it here (before the request resolves) would flash the
      // original wording before the real result lands. Only unrelated
      // previews in this field get cleared for a calm moment.
      const lockedId = suggestionApplyTransition[section]?.gutterAnchorCommentId ?? null;
      json = stripPendingSuggestionsExcept(json, lockedId);
      if (JSON.stringify(json) === before) return;
      editor.commands.setContent(json as Content, { emitUpdate: false });
      return;
    }

    if (
      tablePreviewSuggestionIdRef.current &&
      tablePreviewSuggestionIdRef.current !== activeSuggestionId
    ) {
      // Structural table previews do not use reversible suggestion marks.
      // Restore the provider-owned value before showing the next suggestion
      // (or after dismissing this one).
      json = canonicalJson;
      tablePreviewSuggestionIdRef.current = null;
    }

    json = stripPendingSuggestionsExcept(json, activeSuggestionId);

    if (
      activeSuggestionId &&
      !narrativeHasSuggestionMarks(json, activeSuggestionId)
    ) {
      const comment = comments.find(
        (c) =>
          c.id === activeSuggestionId &&
          isAiSuggestionKind(c.kind) &&
          c.status === "open" &&
          suggestionTargetsField(section, c.contentPath, contentPath)
      );
      if (comment) {
        const validation = validateSuggestionLocate(
          comment,
          section,
          sectionContent,
          contentPath
        );
        if (validation.canPreview && comment.kind === "ai_redraft") {
          // Full-field redraft: current content struck through, replacement
          // highlighted. Same mark machinery as fixes handles accept/dismiss.
          const redraft = parseAiRedraftCommentContent(comment.content);
          json = buildRedraftPreviewDoc(
            json,
            markdownToDoc(redraft.markdown, markdownOptions),
            {
            id: activeSuggestionId,
            authorId: AI_AUTHOR_ID,
            status: "pending",
            createdAt: comment.createdAt,
            kind: "redraft",
          });
        } else if (validation.canPreview) {
          const payload = parseAiFixCommentContent(comment.content);
          if (payload.tableOperation) {
            const preview = buildTableOperationPreviewDoc(
              canonicalJson,
              payload.tableOperation,
              {
                id: activeSuggestionId,
                authorId: AI_AUTHOR_ID,
                status: "pending",
                createdAt: comment.createdAt,
                kind: "fix",
              },
              {
                section,
                targetField: contentPath,
              }
            );
            if (preview.ok) {
              json = preview.doc;
              tablePreviewSuggestionIdRef.current = activeSuggestionId;
              if (payload.second) {
                const citeInjected = injectSuggestionMarks(
                  json,
                  {
                    anchorText: payload.second.anchorText,
                    deleteText: payload.second.deleteText,
                    insertText: payload.second.insertText,
                    scope: payload.second.scope,
                  },
                  {
                    id: activeSuggestionId,
                    authorId: AI_AUTHOR_ID,
                    status: "pending",
                    createdAt: comment.createdAt,
                    kind: "fix",
                  }
                );
                if (citeInjected.located) {
                  json = normalizeRichField(citeInjected.doc, richFieldOptions);
                }
              }
            }
          } else if (!payload.tableOperationInvalid) {
            const edit = buildSuggestionEdit({
              anchorText: comment.anchorText,
              deleteText: payload.deleteText,
              insertText: payload.insertText,
              insertImage: payload.insertImage,
              removeImage: payload.removeImage,
              scope: payload.scope,
              second: payload.second,
            });
            const injected = injectSuggestionMarks(json, edit, {
              id: activeSuggestionId,
              authorId: AI_AUTHOR_ID,
              status: "pending",
              createdAt: comment.createdAt,
              kind: "fix",
            });
            // Never paint a preview (or enable inline accept) unless locate succeeded.
            if (injected.located) {
              json = normalizeRichField(injected.doc, richFieldOptions);
            }
          }
        }
      }
    }

    if (JSON.stringify(json) === before) return;

    editor.commands.setContent(json as Content, { emitUpdate: false });
    // Suggestion preview marks are editor-local UI. Persisting them into section
    // state makes the external-value sync immediately re-run this effect.
  }, [
    editor,
    contentPath,
    isRichField,
    activeSuggestionId,
    comments,
    richContentKey,
    previewHeld,
    section,
    sectionContent,
    suggestionApplyTransition,
    value,
    richFieldOptions,
    markdownOptions,
  ]);

  // Debounced decoration refresh — coalesces hover-driven updates to one per frame.
  const hoverRefreshFrame = useRef<number | null>(null);
  useEffect(() => {
    if (!editor) return;

    if (hoverRefreshFrame.current != null) cancelAnimationFrame(hoverRefreshFrame.current);
    hoverRefreshFrame.current = requestAnimationFrame(() => {
      hoverRefreshFrame.current = null;
      editor.view.dispatch(
        editor.state.tr.setMeta("commentRefresh", true).setMeta("addToHistory", false)
      );
    });

    return () => {
      if (hoverRefreshFrame.current != null) {
        cancelAnimationFrame(hoverRefreshFrame.current);
        hoverRefreshFrame.current = null;
      }
    };
  }, [editor, activeCommentId, filteredRanges]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr
        .setMeta(placeholderRefreshMeta, true)
        .setMeta("addToHistory", false)
    );
  }, [editor, focusedPanelPlaceholderId, section, contentPath]);

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

  const activeTableCellAttrs =
    editor && editable && editor.isActive("table")
      ? editor.isActive("tableHeader")
        ? editor.getAttributes("tableHeader")
        : editor.getAttributes("tableCell")
      : null;
  const tableHAlign = (activeTableCellAttrs?.align as string | undefined) ?? null;
  const tableVAlign = (activeTableCellAttrs?.verticalAlign as string | undefined) ?? null;

  const inactiveSuggestionCss = isRichField
    ? buildInactiveSuggestionCss(activeSuggestionId)
    : "";

  return (
    <div className={className}>
      {inactiveSuggestionCss ? (
        <style dangerouslySetInnerHTML={{ __html: inactiveSuggestionCss }} />
      ) : null}
      {label ? (
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Label>{label}</Label>
        </div>
      ) : null}

      {editor && editable && activeEditorKey === thisEditorKey && (
        <FloatingMenu
          editor={editor}
          pluginKey={`tableEditFloatingMenu:${thisEditorKey}`}
          updateDelay={50}
          appendTo={() => document.body}
          options={{
            placement: "top-start",
            offset: 10,
            flip: true,
            shift: { padding: 8 },
          }}
          shouldShow={({ editor: ed }) =>
            ed.isEditable &&
            ed.isActive("table") &&
            ed.view.hasFocus() &&
            !commentComposing
          }
        >
          <TableEditToolbar
            editor={editor}
            tableHAlign={tableHAlign}
            tableVAlign={tableVAlign}
          />
        </FloatingMenu>
      )}

      {editor && (
        <BubbleMenu
          editor={editor}
          appendTo={() => document.body}
          options={{
            placement: "right-end",
            offset: 10,
            flip: true,
            shift: { padding: 8 },
          }}
          shouldShow={({ editor: ed, state }) => {
            if (!canInlineComment || !ed.isEditable) return false;
            if (commentComposing) return true;
            if (state.selection.empty) return false;
            // Don't show comment bubble when the selection covers a placeholder
            // (user clicked to fill it, not to comment on it)
            if (isSelectionOverPlaceholder(state)) return false;
            return true;
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
                  maxLength={1024}
                  autoFocus
                />
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    "text-[10px] tabular-nums",
                    commentDraft.length > 960 ? "text-red-500" : "text-[var(--muted-foreground)]"
                  )}>
                    {commentDraft.length}/1024
                  </span>
                  <div className="flex gap-2">
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
                      disabled={posting || !commentDraft.trim() || commentDraft.length > 1024}
                    >
                      {posting ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Post"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </BubbleMenu>
      )}

      <TiptapEditorContextMenu
        editor={editor}
        editable={editable}
        reportId={report.id}
      >
        <div
          className={cn(
            "min-w-0 max-w-full overflow-x-auto overscroll-x-contain text-sm leading-relaxed",
            chrome === "page"
              ? "bg-transparent"
              : "rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--ring)]",
            compact
              ? "[&_.ProseMirror]:min-h-0 [&_.ProseMirror>p.is-empty:last-child]:hidden [&_.ProseMirror_table]:my-0"
              : chrome === "page"
                ? "[&_.ProseMirror]:min-h-[calc(var(--generic-page-height)-2*var(--generic-page-margin))]"
                : "min-h-[200px] [&_.ProseMirror]:min-h-[180px]",
            "[&_.ProseMirror]:outline-none",
            "[&_.tiptap-image-inline]:my-1 [&_.tiptap-image-inline]:max-w-full [&_.tiptap-image-inline]:h-auto [&_.tiptap-image-inline]:rounded-sm",
            "[&_.tiptap-math-block]:my-2",
            !editable && "opacity-90",
            previewHeld &&
              !isBulkSuggestionApply(previewHeldMode) &&
              "suggestion-field-settling"
          )}
          data-field-anchor={`${section}.${contentPath}`}
          data-editor-chrome={chrome}
          data-active-suggestion-id={activeSuggestionId ?? ""}
          data-suggestion-preview-held={previewHeldMode}
          {...(chrome === "page" ? { "aria-label": "Document body" } : {})}
        >
          {editor ? <EditorContent editor={editor} /> : null}
        </div>
      </TiptapEditorContextMenu>

    </div>
  );
}
