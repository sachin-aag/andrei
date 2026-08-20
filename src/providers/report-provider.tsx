"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import type {
  CommentRecord,
  EvaluationRecord,
  ReportBundle,
  ReportRecord,
  ReportSectionRecord,
} from "@/types/report";
import type {
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT, REPORT_SECTION_ROW_ORDER } from "@/types/sections";
import type { SectionType } from "@/db/schema";
import { mergeSection } from "@/lib/sections-merge";
import {
  getDocumentType,
  getEvaluatableSections,
  mergeSectionForType,
} from "@/lib/document-types";
import { activeSuggestionForSection } from "@/lib/ai/suggestion-gating";
import { validateSuggestionLocate } from "@/lib/suggestions/validate-suggestion";
import { normalizeCommentRecord } from "@/lib/comments/normalize";
import { sectionsReadyForEvaluation } from "@/lib/ai/evaluation-readiness";
import { collectPlaceholders } from "@/lib/placeholders/scan-sections";
import type { Placeholder } from "@/lib/placeholders/find";
import type { UserRole } from "@/lib/auth/roles";
import { ReportAttachmentsProvider } from "@/providers/report-attachments-provider";

type SectionContents = Partial<SectionContentMap> & Record<string, unknown>;

function sectionContentEqual(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function canMutateReportAttachmentsForUser({
  report,
  userId,
  userRole,
}: {
  report: ReportRecord;
  userId: string;
  userRole: UserRole;
}) {
  if (report.status !== "draft" && report.status !== "feedback") return false;

  switch (userRole) {
    case "admin":
      return true;
    case "engineer":
      return report.authorId === userId;
    case "manager":
    case "qa":
      return false;
    default: {
      const exhaustive: never = userRole;
      return exhaustive;
    }
  }
}

export type WorkspaceMode = "edit" | "review" | "view";

/**
 * Which way a suggestion is being resolved. The inline diff calms down
 * differently for each: accepting fades the deletion out, dismissing fades the
 * insertion out.
 */
export type SuggestionApplyMode = "accept" | "dismiss";

/** Queue handoff: wait for the user to jump to the next off-screen suggestion. */
export type SuggestionQueueBridge = {
  nextCommentId: string;
};

export type EditorRegistryEntry = {
  editor: Editor;
  section: SectionType;
  contentPath: string;
};

export function editorRegistryKey(section: SectionType, contentPath: string) {
  return `${section}:${contentPath}`;
}

type ReportContextValue = {
  report: ReportRecord;
  sections: SectionContents;
  sectionRows: ReportSectionRecord[];
  evaluations: EvaluationRecord[];
  comments: CommentRecord[];
  /** Per-section count of AI issues beyond the materialized cap. */
  overflowCounts: Partial<Record<SectionType, number>>;
  readOnly: boolean;
  trackChangesMode: boolean;
  setTrackChangesMode: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceMode: WorkspaceMode;
  currentUserId: string;
  /** Inline / sidebar: which anchored comment thread is focused (dark highlight + expanded panel). */
  activeCommentId: string | null;
  setActiveCommentId: React.Dispatch<React.SetStateAction<string | null>>;
  /** One-shot: editors focus selection at anchor when set (e.g. opening thread from sidebar). */
  pendingCommentFocusCommentId: string | null;
  requestCommentFocus: (commentId: string) => void;
  acknowledgeCommentFocus: () => void;
  /** Comment IDs currently hovered (plural: overlapping ranges can highlight multiple). */
  hoveredCommentIds: string[];
  setHoveredCommentIds: (ids: string[]) => void;
  clearHoveredCommentIds: () => void;
  /** Margin gutter card focus (comment id or `ai:<evaluationId>`). */
  activeAnchorId: string | null;
  setActiveAnchorId: React.Dispatch<React.SetStateAction<string | null>>;
  updateSection: (
    section: string,
    updater: (prev: unknown) => unknown
  ) => void;
  replaceSection: (section: string, next: unknown) => void;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  runEvaluation: (
    section?: SectionType | SectionType[]
  ) => Promise<void>;
  generateSuggestions: (section: SectionType) => Promise<void>;
  isEvaluating: boolean;
  isSuggesting: boolean;
  /** Sections whose evaluation is currently in flight. */
  runningEvalSections: SectionType[];
  /** Sections whose suggestion generation is in flight. */
  runningSuggestionSections: SectionType[];
  /** Active open ai_fix comment id per section (severity-ordered). */
  activeSuggestionIdForSection: (section: SectionType) => string | null;
  /** Open ai_fix used for gutter anchoring (stable during apply transitions). */
  gutterSuggestionCommentForSection: (
    section: SectionType
  ) => CommentRecord | null;
  /** True while apply/queue transition — suppresses next inline preview. */
  isSuggestionPreviewHeld: (section: SectionType) => boolean;
  /** Call before applying a suggestion; locks gutter anchor and hides next inline preview. */
  beginSuggestionApplyTransition: (
    section: SectionType,
    commentId: string,
    mode: SuggestionApplyMode,
    options?: { parkCenterY?: number }
  ) => void;
  /**
   * After apply/dismiss exit: keep preview held and park the gutter card while
   * the user decides to jump to the next off-screen suggestion.
   */
  enterSuggestionQueueBridge: (
    section: SectionType,
    bridge: SuggestionQueueBridge
  ) => void;
  endSuggestionApplyTransition: (section: SectionType) => void;
  /** Per-section apply/dismiss transition — pauses auto-save while set. */
  suggestionApplyTransition: Partial<
    Record<
      SectionType,
      {
        holdInlinePreview: boolean;
        gutterAnchorCommentId: string;
        mode: SuggestionApplyMode;
        /** Freeze suggestion gutter card Y while transitioning / bridging. */
        parkCenterY?: number;
        bridge?: SuggestionQueueBridge;
      }
    >
  >;
  /** Set after suggestions succeed — workspace opens Criteria tab for this section. */
  suggestionsFocusSection: SectionType | null;
  clearSuggestionsFocusSection: () => void;
  /** Unfilled `<to be filled>` placeholders across the live document. */
  pendingPlaceholders: Placeholder[];
  /** Placeholder panel fill input is focused — highlights the matching span in the doc. */
  focusedPanelPlaceholderId: string | null;
  setFocusedPanelPlaceholderId: React.Dispatch<React.SetStateAction<string | null>>;
  setEvaluations: React.Dispatch<React.SetStateAction<EvaluationRecord[]>>;
  setComments: React.Dispatch<React.SetStateAction<CommentRecord[]>>;
  refresh: () => Promise<void>;
  getSectionId: (section: SectionType) => string | null;
  /**
   * Registers the currently-mounted section's autosave flush so submit/refresh
   * can force any pending debounced edit to persist before the report locks or
   * reloads from the server (otherwise a same-tick edit would be lost).
   */
  registerSectionFlush: (
    section: SectionType,
    flush: () => Promise<void>
  ) => () => void;
  /** Await every registered section autosave flush (no-ops when already persisted). */
  flushPendingSectionSaves: () => Promise<void>;
  /** Tiptap editor registry for the margin-gutter to compute anchor positions. */
  registerEditor: (
    section: SectionType,
    contentPath: string,
    editor: Editor
  ) => () => void;
  getEditor: (section: SectionType, contentPath: string) => Editor | null;
  /** Key of the last-focused field (`section:contentPath`), rich or plain. */
  activeFieldKey: string | null;
  activeFieldKind: "rich" | "plain" | null;
  setActiveField: (
    section: SectionType,
    contentPath: string,
    kind: "rich" | "plain"
  ) => void;
  /** Key of the last-focused Tiptap field; null when a plain-text field is active. */
  activeEditorKey: string | null;
  setActiveEditor: (section: SectionType, contentPath: string) => void;
  getActiveEditor: () => Editor | null;
  /** Bumped whenever editors register/unregister or transactions occur. */
  editorTick: number;
};

type ReportDataContextValue = Pick<
  ReportContextValue,
  | "report"
  | "sectionRows"
  | "readOnly"
  | "trackChangesMode"
  | "setTrackChangesMode"
  | "workspaceMode"
  | "currentUserId"
  | "setReport"
  | "refresh"
  | "getSectionId"
  | "registerSectionFlush"
  | "flushPendingSectionSaves"
>;

type ReportSectionsContextValue = Pick<
  ReportContextValue,
  "sections" | "updateSection" | "replaceSection"
>;

type ReportPlaceholdersContextValue = Pick<
  ReportContextValue,
  | "pendingPlaceholders"
  | "focusedPanelPlaceholderId"
  | "setFocusedPanelPlaceholderId"
>;

type ReportSectionContextValue<T = unknown> = {
  value: T;
  update: (updater: (prev: T) => T) => void;
  replace: (next: T) => void;
};

type ReportCommentsContextValue = Pick<
  ReportContextValue,
  | "comments"
  | "setComments"
  | "activeCommentId"
  | "setActiveCommentId"
  | "pendingCommentFocusCommentId"
  | "requestCommentFocus"
  | "acknowledgeCommentFocus"
  | "hoveredCommentIds"
  | "setHoveredCommentIds"
  | "clearHoveredCommentIds"
  | "activeAnchorId"
  | "setActiveAnchorId"
>;

type ReportEvaluationContextValue = Pick<
  ReportContextValue,
  | "evaluations"
  | "overflowCounts"
  | "runEvaluation"
  | "generateSuggestions"
  | "isEvaluating"
  | "isSuggesting"
  | "runningEvalSections"
  | "runningSuggestionSections"
  | "activeSuggestionIdForSection"
  | "gutterSuggestionCommentForSection"
  | "isSuggestionPreviewHeld"
  | "beginSuggestionApplyTransition"
  | "enterSuggestionQueueBridge"
  | "endSuggestionApplyTransition"
  | "suggestionApplyTransition"
  | "suggestionsFocusSection"
  | "clearSuggestionsFocusSection"
  | "setEvaluations"
>;

type ReportEditorsContextValue = Pick<
  ReportContextValue,
  | "registerEditor"
  | "getEditor"
  | "activeFieldKey"
  | "activeFieldKind"
  | "setActiveField"
  | "activeEditorKey"
  | "setActiveEditor"
  | "getActiveEditor"
  | "editorTick"
>;

const ReportDataContext = createContext<ReportDataContextValue | null>(null);
const ReportSectionsContext = createContext<ReportSectionsContextValue | null>(null);
const ReportPlaceholdersContext = createContext<ReportPlaceholdersContextValue | null>(null);
const ReportCommentsContext = createContext<ReportCommentsContextValue | null>(null);
const ReportEvaluationContext = createContext<ReportEvaluationContextValue | null>(null);
const ReportEditorsContext = createContext<ReportEditorsContextValue | null>(null);
const DefineSectionContext = createContext<ReportSectionContextValue<SectionContentMap["define"]> | null>(null);
const MeasureSectionContext = createContext<ReportSectionContextValue<SectionContentMap["measure"]> | null>(null);
const AnalyzeSectionContext = createContext<ReportSectionContextValue<SectionContentMap["analyze"]> | null>(null);
const ImproveSectionContext = createContext<ReportSectionContextValue<SectionContentMap["improve"]> | null>(null);
const ControlSectionContext = createContext<ReportSectionContextValue<SectionContentMap["control"]> | null>(null);
const ConclusionSectionContext = createContext<ReportSectionContextValue<SectionContentMap["conclusion"]> | null>(null);
const DocumentsReviewedSectionContext =
  createContext<ReportSectionContextValue<SectionContentMap["documents_reviewed"]> | null>(null);
const AttachmentsSectionContext =
  createContext<ReportSectionContextValue<SectionContentMap["attachments"]> | null>(null);

function bundleToSections(
  rows: ReportSectionRecord[],
  documentType: ReportRecord["documentType"] = "investigation_report"
): SectionContents {
  const def = getDocumentType(documentType);
  const out: Record<string, unknown> = {};
  for (const section of def.sections.filter((s) => !s.virtual)) {
    const row = rows.find((r) => r.section === section.key);
    if (row) {
      out[section.key] = mergeSectionForType(
        documentType,
        section.key,
        row.content
      );
    } else {
      out[section.key] = section.emptyContent;
    }
  }
  // Backfill investigation keys if somehow missing
  if (documentType === "investigation_report") {
    for (const section of REPORT_SECTION_ROW_ORDER) {
      if (!(section in out) && def.sections.some((s) => s.key === section)) {
        out[section] = EMPTY_CONTENT[section];
      }
    }
  }
  return out as SectionContents;
}

export function ReportProvider({
  bundle,
  currentUserId,
  currentUserRole,
  readOnly,
  initialTrackChangesMode = false,
  workspaceMode = "edit",
  children,
}: {
  bundle: ReportBundle;
  currentUserId: string;
  currentUserRole: UserRole;
  readOnly: boolean;
  /** Manager: typically true on review; engineer: false. User can toggle in the workspace header. */
  initialTrackChangesMode?: boolean;
  workspaceMode?: WorkspaceMode;
  children: React.ReactNode;
}) {
  const [trackChangesMode, setTrackChangesMode] = useState(initialTrackChangesMode);
  const [report, setReport] = useState<ReportRecord>(bundle.report);
  const [sectionRows, setSectionRows] = useState<ReportSectionRecord[]>(
    bundle.sections
  );
  const [sections, setSections] = useState<SectionContents>(() =>
    bundleToSections(bundle.sections, bundle.report.documentType)
  );

  const [trackChangesSync, setTrackChangesSync] = useState({
    id: bundle.report.id,
    initial: initialTrackChangesMode,
  });
  if (
    trackChangesSync.id !== bundle.report.id ||
    trackChangesSync.initial !== initialTrackChangesMode
  ) {
    setTrackChangesSync({
      id: bundle.report.id,
      initial: initialTrackChangesMode,
    });
    setTrackChangesMode(initialTrackChangesMode);
  }
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>(
    bundle.evaluations
  );
  const [comments, setComments] = useState<CommentRecord[]>(() =>
    bundle.comments.map((c) =>
      normalizeCommentRecord(c as unknown as Record<string, unknown>)
    )
  );
  const [suggestionsFocusSection, setSuggestionsFocusSection] =
    useState<SectionType | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [overflowCounts, setOverflowCounts] = useState<
    Partial<Record<SectionType, number>>
  >({});

  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [focusedPanelPlaceholderId, setFocusedPanelPlaceholderId] = useState<
    string | null
  >(null);
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
  const [hoveredCommentIds, setHoveredCommentIdsRaw] = useState<string[]>([]);

  const setHoveredCommentIds = useCallback((ids: string[]) => {
    setHoveredCommentIdsRaw((prev) => {
      if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return prev;
      return ids;
    });
  }, []);

  const clearHoveredCommentIds = useCallback(() => {
    setHoveredCommentIdsRaw((prev) => (prev.length === 0 ? prev : []));
  }, []);
  const [pendingCommentFocusCommentId, setPendingCommentFocusCommentId] = useState<string | null>(
    null
  );

  /**
   * Imperative editor registry. Keyed by `section:contentPath`. The margin gutter
   * uses these editor refs to compute live anchor coordinates via `view.coordsAtPos`.
   */
  const editorsRef = useRef<Map<string, EditorRegistryEntry>>(new Map());
  const sectionFlushesRef = useRef<Map<SectionType, () => Promise<void>>>(
    new Map()
  );
  const [editorTick, setEditorTick] = useState(0);
  const [activeField, setActiveFieldState] = useState<{
    key: string;
    kind: "rich" | "plain";
  } | null>(null);
  const activeFieldKey = activeField?.key ?? null;
  const activeFieldKind = activeField?.kind ?? null;
  const activeEditorKey =
    activeField?.kind === "rich" ? activeField.key : null;

  const registerEditor = useCallback(
    (section: SectionType, contentPath: string, editor: Editor) => {
      const key = editorRegistryKey(section, contentPath);
      editorsRef.current.set(key, { editor, section, contentPath });
      setEditorTick((n) => n + 1);

      // Coalesce rapid bursts of `update` events into one state bump per frame.
      // We intentionally do NOT subscribe to `transaction` — selection-only and
      // decoration-only transactions would cause re-render storms that can in
      // turn trigger more transactions (focus shuffling, etc.) and infinite
      // loops. `update` only fires when the doc actually changes, which is the
      // only thing that can move our anchor positions.
      let frame: number | null = null;
      const onUpdate = () => {
        if (frame != null) return;
        frame = requestAnimationFrame(() => {
          frame = null;
          setEditorTick((n) => n + 1);
        });
      };
      editor.on("update", onUpdate);
      return () => {
        if (frame != null) cancelAnimationFrame(frame);
        editor.off("update", onUpdate);
        const cur = editorsRef.current.get(key);
        if (cur && cur.editor === editor) {
          editorsRef.current.delete(key);
          setEditorTick((n) => n + 1);
        }
      };
    },
    []
  );

  const getEditor = useCallback(
    (section: SectionType, contentPath: string) => {
      return editorsRef.current.get(editorRegistryKey(section, contentPath))?.editor ?? null;
    },
    []
  );

  const setActiveField = useCallback(
    (section: SectionType, contentPath: string, kind: "rich" | "plain") => {
      setActiveFieldState({ key: editorRegistryKey(section, contentPath), kind });
    },
    []
  );

  const setActiveEditor = useCallback(
    (section: SectionType, contentPath: string) => {
      setActiveField(section, contentPath, "rich");
    },
    [setActiveField]
  );

  const getActiveEditor = useCallback(() => {
    if (!activeEditorKey) return null;
    return editorsRef.current.get(activeEditorKey)?.editor ?? null;
  }, [activeEditorKey]);

  const requestCommentFocus = useCallback((commentId: string) => {
    setPendingCommentFocusCommentId(commentId);
    setActiveCommentId(commentId);
    setActiveAnchorId(commentId);
  }, []);

  const acknowledgeCommentFocus = useCallback(() => {
    setPendingCommentFocusCommentId(null);
  }, []);

  const updateSection = useCallback(
    (section: string, updater: (prev: unknown) => unknown) => {
      setSections((prev) => {
        const current =
          prev[section] ??
          (section in EMPTY_CONTENT
            ? EMPTY_CONTENT[section as keyof SectionContentMap]
            : {});
        const next = updater(current);
        if (sectionContentEqual(current, next)) return prev;
        return { ...prev, [section]: next };
      });
    },
    []
  );

  const replaceSection = useCallback((section: string, next: unknown) => {
    setSections((prev) => {
      const current =
        prev[section] ??
        (section in EMPTY_CONTENT
          ? EMPTY_CONTENT[section as keyof SectionContentMap]
          : {});
      if (sectionContentEqual(current, next)) return prev;
      return { ...prev, [section]: next };
    });
  }, []);

  /**
   * Every mounted section editor registers its autosave flush here so submit
   * and refresh can persist pending debounced edits before locking/reloading.
   */
  const registerSectionFlush = useCallback(
    (section: SectionType, flush: () => Promise<void>) => {
      sectionFlushesRef.current.set(section, flush);
      return () => {
        if (sectionFlushesRef.current.get(section) === flush) {
          sectionFlushesRef.current.delete(section);
        }
      };
    },
    []
  );

  const flushPendingSectionSaves = useCallback(async () => {
    const flushes = [...sectionFlushesRef.current.values()];
    await Promise.all(flushes.map((flush) => flush()));
  }, []);

  const refresh = useCallback(async () => {
    // Force any pending debounced edit to persist before reloading — otherwise
    // an edit made in the last ~1.5s could still be un-saved when the fetch
    // below overwrites local section state.
    try {
      await flushPendingSectionSaves();
    } catch {
      // Keep refresh usable even if a pending save failed; submit awaits
      // flushPendingSectionSaves itself and can abort on failure.
    }
    const res = await fetch(`/api/reports/${bundle.report.id}`);
    if (!res.ok) return;
    const data = (await res.json()) as ReportBundle;
    setReport(data.report);
    setSectionRows(data.sections);
    setSections(bundleToSections(data.sections, data.report.documentType));
    setEvaluations(
      (data.evaluations as EvaluationRecord[]).map((e) => ({
        ...e,
        updatedAt:
          typeof e.updatedAt === "string"
            ? e.updatedAt
            : new Date(e.updatedAt as string).toISOString(),
      }))
    );
    setComments(
      (data.comments as Record<string, unknown>[]).map((c) =>
        normalizeCommentRecord(c)
      )
    );
  }, [bundle.report.id, flushPendingSectionSaves]);

  const getSectionId = useCallback(
    (section: SectionType) =>
      sectionRows.find((r) => r.section === section)?.id ?? null,
    [sectionRows]
  );

  // ─── Manual evaluation ──────────────────────────────────────────────────
  const [runningEvalSections, setRunningEvalSections] = useState<SectionType[]>(
    []
  );
  const [runningSuggestionSections, setRunningSuggestionSections] = useState<
    SectionType[]
  >([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  type SuggestionApplyTransition = {
    holdInlinePreview: boolean;
    gutterAnchorCommentId: string;
    mode: SuggestionApplyMode;
    parkCenterY?: number;
    bridge?: SuggestionQueueBridge;
  };
  const [suggestionApplyTransition, setSuggestionApplyTransition] = useState<
    Partial<Record<SectionType, SuggestionApplyTransition>>
  >({});

  // Mirror of `sections` for callbacks that must read latest draft without widening deps.
  const sectionsRef = useRef<SectionContents>(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const runEvaluation = useCallback(
    async (section?: SectionType | SectionType[]) => {
      const documentType = report.documentType;
      const evaluatable = getEvaluatableSections(documentType).map((s) => s.key);
      const targets = section
        ? Array.isArray(section)
          ? section
          : [section]
        : [...evaluatable];

      const readiness = sectionsReadyForEvaluation({
        documentType,
        targets,
        documentNo: report.documentNo,
        contentFor: (key) =>
          key === "cover_page" ? report.metadata : sectionsRef.current[key],
      });
      if (readiness.error) {
        toast.error(readiness.error);
        return;
      }

      setRunningEvalSections(readiness.ready);
      setIsEvaluating(true);
      try {
        const res = await fetch(`/api/reports/${bundle.report.id}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sections: readiness.ready,
            reason: "manual",
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const message =
            typeof errBody.error === "string"
              ? errBody.error
              : "AI evaluation failed. Please try again.";
          toast.error(message);
          return;
        }
        const data = await res.json();
        setEvaluations(data.evaluations as EvaluationRecord[]);
        if (data.overflowCounts && typeof data.overflowCounts === "object") {
          setOverflowCounts(
            data.overflowCounts as Partial<Record<SectionType, number>>
          );
        } else {
          setOverflowCounts({});
        }
        toast.success("AI evaluation complete");
      } catch (err) {
        console.error(err);
        toast.error("AI evaluation failed");
      } finally {
        setIsEvaluating(false);
        setRunningEvalSections([]);
      }
    },
    [bundle.report.id, report]
  );

  const generateSuggestions = useCallback(
    async (section: SectionType) => {
      setRunningSuggestionSections([section]);
      setIsSuggesting(true);
      try {
        const res = await fetch(
          `/api/reports/${bundle.report.id}/suggestions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ section }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.blocked && data.reason === "no_gap_criteria") {
            toast.error("Resolve pending suggestions before requesting more.");
          } else if (data.blocked && data.reason === "stale_evaluation") {
            toast.error("Content changed — re-run criteria for this section first.");
          } else {
            toast.error(
              typeof data.error === "string"
                ? data.error
                : "Suggestion generation failed."
            );
          }
          return;
        }
        const dropped = data.dropped as Array<{ criterionKey: string; reason: string }> | undefined;
        const applied = data.applied as
          | Array<{ suggestionId: string; criterionKey: string }>
          | undefined;

        if (Array.isArray(data.newComments) && data.newComments.length > 0) {
          setComments((prev) => {
            const ids = new Set(prev.map((c) => c.id));
            const added = (data.newComments as Record<string, unknown>[])
              .map((c) => normalizeCommentRecord(c))
              .filter((c) => !ids.has(c.id));
            return added.length ? [...prev, ...added] : prev;
          });
        }

        // Reload from server so narrative marks + comments stay in sync (avoids autosave races).
        await refresh();

        if (dropped?.length) {
          for (const d of dropped) {
            toast.warning(`No fix for ${d.criterionKey}: ${d.reason}`);
          }
        }
        if (applied?.length) {
          setSuggestionsFocusSection(section);
          toast.success(
            `Generated ${applied.length} suggestion${applied.length === 1 ? "" : "s"} — see inline preview in the narrative`
          );
        } else if (!dropped?.length) {
          toast.message("No new suggestions were generated.");
        }

        // Let editors apply refreshed section JSON before autosave resumes.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      } catch (err) {
        console.error(err);
        const isNetworkFailure =
          err instanceof TypeError &&
          (err.message === "Failed to fetch" ||
            err.message === "NetworkError when attempting to fetch resource.");
        toast.error(
          isNetworkFailure
            ? "Could not reach the server — wait for the page to finish loading, then try Suggest fixes again."
            : "Suggestion generation failed"
        );
      } finally {
        setIsSuggesting(false);
        setRunningSuggestionSections([]);
      }
    },
    [bundle.report.id, refresh]
  );

  const clearSuggestionsFocusSection = useCallback(() => {
    setSuggestionsFocusSection(null);
  }, []);

  const beginSuggestionApplyTransition = useCallback(
    (
      section: SectionType,
      commentId: string,
      mode: SuggestionApplyMode,
      options?: { parkCenterY?: number }
    ) => {
      setSuggestionApplyTransition((prev) => ({
        ...prev,
        [section]: {
          holdInlinePreview: true,
          gutterAnchorCommentId: commentId,
          mode,
          parkCenterY: options?.parkCenterY,
        },
      }));
    },
    []
  );

  const enterSuggestionQueueBridge = useCallback(
    (section: SectionType, bridge: SuggestionQueueBridge) => {
      setSuggestionApplyTransition((prev) => {
        const current = prev[section];
        if (!current) return prev;
        return {
          ...prev,
          [section]: {
            ...current,
            holdInlinePreview: true,
            bridge,
          },
        };
      });
    },
    []
  );

  const endSuggestionApplyTransition = useCallback((section: SectionType) => {
    setSuggestionApplyTransition((prev) => {
      const next = { ...prev };
      delete next[section];
      return next;
    });
  }, []);

  const isSuggestionPreviewHeld = useCallback(
    (section: SectionType) =>
      suggestionApplyTransition[section]?.holdInlinePreview === true,
    [suggestionApplyTransition]
  );

  const gutterSuggestionCommentForSection = useCallback(
    (section: SectionType) => {
      const transition = suggestionApplyTransition[section];
      if (transition?.bridge) {
        const next = comments.find(
          (c) => c.id === transition.bridge!.nextCommentId && c.status === "open"
        );
        if (next) return next;
      }
      const lockedId = transition?.gutterAnchorCommentId;
      if (lockedId) {
        const locked = comments.find((c) => c.id === lockedId);
        if (locked) return locked;
      }
      return activeSuggestionForSection(section, comments, evaluations);
    },
    [comments, evaluations, suggestionApplyTransition]
  );

  const activeSuggestionIdForSection = useCallback(
    (section: SectionType) => {
      if (isSuggestionPreviewHeld(section)) return null;
      const active = activeSuggestionForSection(section, comments, evaluations);
      if (!active) return null;
      const validation = validateSuggestionLocate(
        active,
        section,
        sections[section as keyof SectionContentMap]
      );
      return validation.canPreview ? active.id : null;
    },
    [comments, evaluations, isSuggestionPreviewHeld, sections]
  );

  // Scan narrative for unfilled placeholders (to-be-filled tokens + bracket guidance).
  // Single source of truth for the header badge + Sheet panel + inline highlights.
  const pendingPlaceholders = useMemo(
    () => collectPlaceholders(sections),
    [sections]
  );

  const canMutateAttachments = useMemo(
    () =>
      canMutateReportAttachmentsForUser({
        report,
        userId: currentUserId,
        userRole: currentUserRole,
      }),
    [currentUserId, currentUserRole, report]
  );

  const reportDataValue = useMemo<ReportDataContextValue>(
    () => ({
      report,
      sectionRows,
      readOnly,
      trackChangesMode,
      setTrackChangesMode,
      workspaceMode,
      currentUserId,
      setReport,
      refresh,
      getSectionId,
      registerSectionFlush,
      flushPendingSectionSaves,
    }),
    [
      report,
      sectionRows,
      readOnly,
      trackChangesMode,
      setTrackChangesMode,
      workspaceMode,
      currentUserId,
      refresh,
      getSectionId,
      registerSectionFlush,
      flushPendingSectionSaves,
    ]
  );

  const sectionsValue = useMemo<ReportSectionsContextValue>(
    () => ({
      sections,
      updateSection,
      replaceSection,
    }),
    [sections, updateSection, replaceSection]
  );

  const placeholdersValue = useMemo<ReportPlaceholdersContextValue>(
    () => ({
      pendingPlaceholders,
      focusedPanelPlaceholderId,
      setFocusedPanelPlaceholderId,
    }),
    [pendingPlaceholders, focusedPanelPlaceholderId]
  );

  const defineSectionValue = useMemo<ReportSectionContextValue<SectionContentMap["define"]>>(
    () => ({
      value: (sections.define ?? EMPTY_CONTENT.define) as SectionContentMap["define"],
      update: (updater) => updateSection("define", updater as (prev: unknown) => unknown),
      replace: (next) => replaceSection("define", next),
    }),
    [sections.define, updateSection, replaceSection]
  );

  const measureSectionValue = useMemo<ReportSectionContextValue<SectionContentMap["measure"]>>(
    () => ({
      value: (sections.measure ?? EMPTY_CONTENT.measure) as SectionContentMap["measure"],
      update: (updater) => updateSection("measure", updater as (prev: unknown) => unknown),
      replace: (next) => replaceSection("measure", next),
    }),
    [sections.measure, updateSection, replaceSection]
  );

  const analyzeSectionValue = useMemo<ReportSectionContextValue<SectionContentMap["analyze"]>>(
    () => ({
      value: (sections.analyze ?? EMPTY_CONTENT.analyze) as SectionContentMap["analyze"],
      update: (updater) => updateSection("analyze", updater as (prev: unknown) => unknown),
      replace: (next) => replaceSection("analyze", next),
    }),
    [sections.analyze, updateSection, replaceSection]
  );

  const improveSectionValue = useMemo<ReportSectionContextValue<SectionContentMap["improve"]>>(
    () => ({
      value: (sections.improve ?? EMPTY_CONTENT.improve) as SectionContentMap["improve"],
      update: (updater) => updateSection("improve", updater as (prev: unknown) => unknown),
      replace: (next) => replaceSection("improve", next),
    }),
    [sections.improve, updateSection, replaceSection]
  );

  const controlSectionValue = useMemo<ReportSectionContextValue<SectionContentMap["control"]>>(
    () => ({
      value: (sections.control ?? EMPTY_CONTENT.control) as SectionContentMap["control"],
      update: (updater) => updateSection("control", updater as (prev: unknown) => unknown),
      replace: (next) => replaceSection("control", next),
    }),
    [sections.control, updateSection, replaceSection]
  );

  const conclusionSectionValue = useMemo<ReportSectionContextValue<SectionContentMap["conclusion"]>>(
    () => ({
      value: (sections.conclusion ?? EMPTY_CONTENT.conclusion) as SectionContentMap["conclusion"],
      update: (updater) => updateSection("conclusion", updater as (prev: unknown) => unknown),
      replace: (next) => replaceSection("conclusion", next),
    }),
    [sections.conclusion, updateSection, replaceSection]
  );

  const documentsReviewedSectionValue = useMemo<
    ReportSectionContextValue<SectionContentMap["documents_reviewed"]>
  >(
    () => ({
      value: (sections.documents_reviewed ?? EMPTY_CONTENT.documents_reviewed) as SectionContentMap["documents_reviewed"],
      update: (updater) =>
        updateSection("documents_reviewed", updater as (prev: unknown) => unknown),
      replace: (next) => replaceSection("documents_reviewed", next),
    }),
    [sections.documents_reviewed, updateSection, replaceSection]
  );

  const attachmentsSectionValue = useMemo<ReportSectionContextValue<SectionContentMap["attachments"]>>(
    () => ({
      value: (sections.attachments ?? EMPTY_CONTENT.attachments) as SectionContentMap["attachments"],
      update: (updater) => updateSection("attachments", updater as (prev: unknown) => unknown),
      replace: (next) => replaceSection("attachments", next),
    }),
    [sections.attachments, updateSection, replaceSection]
  );

  const commentsValue = useMemo<ReportCommentsContextValue>(
    () => ({
      comments,
      setComments,
      activeCommentId,
      setActiveCommentId,
      hoveredCommentIds,
      setHoveredCommentIds,
      clearHoveredCommentIds,
      activeAnchorId,
      setActiveAnchorId,
      pendingCommentFocusCommentId,
      requestCommentFocus,
      acknowledgeCommentFocus,
    }),
    [
      comments,
      activeCommentId,
      hoveredCommentIds,
      setHoveredCommentIds,
      clearHoveredCommentIds,
      activeAnchorId,
      pendingCommentFocusCommentId,
      requestCommentFocus,
      acknowledgeCommentFocus,
    ]
  );

  const evaluationValue = useMemo<ReportEvaluationContextValue>(
    () => ({
      evaluations,
      overflowCounts,
      runEvaluation,
      generateSuggestions,
      isEvaluating,
      isSuggesting,
      runningEvalSections,
      runningSuggestionSections,
      activeSuggestionIdForSection,
      gutterSuggestionCommentForSection,
      isSuggestionPreviewHeld,
      beginSuggestionApplyTransition,
      enterSuggestionQueueBridge,
      endSuggestionApplyTransition,
      suggestionApplyTransition,
      suggestionsFocusSection,
      clearSuggestionsFocusSection,
      setEvaluations,
    }),
    [
      evaluations,
      overflowCounts,
      runEvaluation,
      generateSuggestions,
      isEvaluating,
      isSuggesting,
      runningEvalSections,
      runningSuggestionSections,
      activeSuggestionIdForSection,
      gutterSuggestionCommentForSection,
      isSuggestionPreviewHeld,
      beginSuggestionApplyTransition,
      enterSuggestionQueueBridge,
      endSuggestionApplyTransition,
      suggestionApplyTransition,
      suggestionsFocusSection,
      clearSuggestionsFocusSection,
    ]
  );

  const editorsValue = useMemo<ReportEditorsContextValue>(
    () => ({
      registerEditor,
      getEditor,
      activeFieldKey,
      activeFieldKind,
      setActiveField,
      activeEditorKey,
      setActiveEditor,
      getActiveEditor,
      editorTick,
    }),
    [
      registerEditor,
      getEditor,
      activeFieldKey,
      activeFieldKind,
      setActiveField,
      activeEditorKey,
      setActiveEditor,
      getActiveEditor,
      editorTick,
    ]
  );

  return (
    <ReportDataContext.Provider value={reportDataValue}>
      <ReportSectionsContext.Provider value={sectionsValue}>
        <ReportPlaceholdersContext.Provider value={placeholdersValue}>
          <DefineSectionContext.Provider value={defineSectionValue}>
            <MeasureSectionContext.Provider value={measureSectionValue}>
              <AnalyzeSectionContext.Provider value={analyzeSectionValue}>
                <ImproveSectionContext.Provider value={improveSectionValue}>
                  <ControlSectionContext.Provider value={controlSectionValue}>
                    <ConclusionSectionContext.Provider value={conclusionSectionValue}>
                      <DocumentsReviewedSectionContext.Provider
                        value={documentsReviewedSectionValue}
                      >
                        <AttachmentsSectionContext.Provider value={attachmentsSectionValue}>
                          <ReportEvaluationContext.Provider value={evaluationValue}>
                            <ReportCommentsContext.Provider value={commentsValue}>
                              <ReportEditorsContext.Provider value={editorsValue}>
                                <ReportAttachmentsProvider
                                  key={report.id}
                                  reportId={report.id}
                                  initialAttachments={bundle.attachments}
                                  initialFolders={bundle.attachmentFolders ?? []}
                                  canMutateAttachments={canMutateAttachments}
                                >
                                  {children}
                                </ReportAttachmentsProvider>
                              </ReportEditorsContext.Provider>
                            </ReportCommentsContext.Provider>
                          </ReportEvaluationContext.Provider>
                        </AttachmentsSectionContext.Provider>
                      </DocumentsReviewedSectionContext.Provider>
                    </ConclusionSectionContext.Provider>
                  </ControlSectionContext.Provider>
                </ImproveSectionContext.Provider>
              </AnalyzeSectionContext.Provider>
            </MeasureSectionContext.Provider>
          </DefineSectionContext.Provider>
        </ReportPlaceholdersContext.Provider>
      </ReportSectionsContext.Provider>
    </ReportDataContext.Provider>
  );
}

export function useReport(): ReportContextValue {
  const data = useReportData();
  const sections = useReportSections();
  const placeholders = useReportPlaceholders();
  const evaluations = useReportEvaluations();
  const comments = useReportComments();
  const editors = useReportEditors();

  return useMemo(
    () => ({
      ...data,
      ...sections,
      ...placeholders,
      ...evaluations,
      ...comments,
      ...editors,
    }),
    [data, sections, placeholders, evaluations, comments, editors]
  );
}

export function useReportData() {
  const ctx = useContext(ReportDataContext);
  if (!ctx) throw new Error("useReportData must be used within ReportProvider");
  return ctx;
}

export function useReportSections() {
  const ctx = useContext(ReportSectionsContext);
  if (!ctx) throw new Error("useReportSections must be used within ReportProvider");
  return ctx;
}

export function useReportSection<K extends keyof SectionContentMap>(
  section: K
): ReportSectionContextValue<SectionContentMap[K]> {
  const define = useContext(DefineSectionContext);
  const measure = useContext(MeasureSectionContext);
  const analyze = useContext(AnalyzeSectionContext);
  const improve = useContext(ImproveSectionContext);
  const control = useContext(ControlSectionContext);
  const conclusion = useContext(ConclusionSectionContext);
  const documentsReviewed = useContext(DocumentsReviewedSectionContext);
  const attachments = useContext(AttachmentsSectionContext);
  if (
    !define ||
    !measure ||
    !analyze ||
    !improve ||
    !control ||
    !conclusion ||
    !documentsReviewed ||
    !attachments
  ) {
    throw new Error("useReportSection must be used within ReportProvider");
  }

  switch (section) {
    case "define":
      return define as unknown as ReportSectionContextValue<SectionContentMap[K]>;
    case "measure":
      return measure as unknown as ReportSectionContextValue<SectionContentMap[K]>;
    case "analyze":
      return analyze as unknown as ReportSectionContextValue<SectionContentMap[K]>;
    case "improve":
      return improve as unknown as ReportSectionContextValue<SectionContentMap[K]>;
    case "control":
      return control as unknown as ReportSectionContextValue<SectionContentMap[K]>;
    case "conclusion":
      return conclusion as unknown as ReportSectionContextValue<SectionContentMap[K]>;
    case "documents_reviewed":
      return documentsReviewed as unknown as ReportSectionContextValue<SectionContentMap[K]>;
    case "attachments":
      return attachments as unknown as ReportSectionContextValue<SectionContentMap[K]>;
    case "signature_approvals":
      throw new Error("signature_approvals is not editable via useReportSection");
    default: {
      const exhaustive: never = section;
      throw new Error(`Unknown report section: ${exhaustive}`);
    }
  }
}

/**
 * Generic section subscription for non-investigation document types.
 * Uses the shared sections context rather than per-section React contexts.
 */
export function useGenericReportSection<T = unknown>(
  section: string
): ReportSectionContextValue<T> {
  const { sections, updateSection, replaceSection } = useReportSections();
  const value = (sections[section] ?? {}) as T;
  return useMemo(
    () => ({
      value,
      update: (updater: (prev: T) => T) =>
        updateSection(section, (prev) => updater(prev as T)),
      replace: (next: T) => replaceSection(section, next),
    }),
    [section, value, updateSection, replaceSection]
  );
}

export function useReportPlaceholders() {
  const ctx = useContext(ReportPlaceholdersContext);
  if (!ctx) throw new Error("useReportPlaceholders must be used within ReportProvider");
  return ctx;
}

export function useReportComments() {
  const ctx = useContext(ReportCommentsContext);
  if (!ctx) throw new Error("useReportComments must be used within ReportProvider");
  return ctx;
}

export function useReportEvaluations() {
  const ctx = useContext(ReportEvaluationContext);
  if (!ctx) throw new Error("useReportEvaluations must be used within ReportProvider");
  return ctx;
}

export function useReportEditors() {
  const ctx = useContext(ReportEditorsContext);
  if (!ctx) throw new Error("useReportEditors must be used within ReportProvider");
  return ctx;
}
