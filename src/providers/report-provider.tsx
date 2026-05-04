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
import { EDITABLE_SECTIONS, EMPTY_CONTENT } from "@/types/sections";
import type { SectionType } from "@/db/schema";
import { mergeSection } from "@/lib/sections-merge";
import { hashContent } from "@/lib/ai/content-hash";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import {
  hasEnoughContextInFirstSection,
  INSUFFICIENT_FIRST_SECTION_MESSAGE,
} from "@/lib/ai/first-section-context";
import { collectPlaceholders } from "@/lib/placeholders/scan-sections";
import type { Placeholder } from "@/lib/placeholders/find";

type SectionContents = Partial<{
  [K in keyof SectionContentMap]: SectionContentMap[K];
}>;

export type WorkspaceMode = "edit" | "review";

export type EvaluationReason = "manual" | "idle" | "post-action";

/** ms of editor idleness before an auto-eval fires for a section. */
const AUTO_EVAL_IDLE_MS = 60_000;

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
  updateSection: <K extends keyof SectionContentMap>(
    section: K,
    updater: (prev: SectionContentMap[K]) => SectionContentMap[K]
  ) => void;
  replaceSection: <K extends keyof SectionContentMap>(
    section: K,
    next: SectionContentMap[K]
  ) => void;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  runEvaluation: (
    section?: SectionType | SectionType[],
    opts?: { reason?: EvaluationReason }
  ) => Promise<void>;
  /**
   * Schedule an evaluation for one or more sections after the user goes idle
   * (or immediately after a meaningful action, e.g. accept/ignore a fix).
   * Multiple calls coalesce per section and never run concurrently.
   */
  scheduleEvaluation: (
    section: SectionType | SectionType[],
    opts?: { immediate?: boolean; reason?: EvaluationReason }
  ) => void;
  isEvaluating: boolean;
  /** Sections whose idle-debounce timer is currently armed. */
  pendingEvalSections: SectionType[];
  /** Sections whose evaluation is currently in flight. */
  runningEvalSections: SectionType[];
  /** Unfilled `<to be filled>` placeholders across the live document. */
  pendingPlaceholders: Placeholder[];
  setEvaluations: React.Dispatch<React.SetStateAction<EvaluationRecord[]>>;
  setComments: React.Dispatch<React.SetStateAction<CommentRecord[]>>;
  refresh: () => Promise<void>;
  getSectionId: (section: SectionType) => string | null;
  /** Tiptap editor registry for the margin-gutter to compute anchor positions. */
  registerEditor: (
    section: SectionType,
    contentPath: string,
    editor: Editor
  ) => () => void;
  getEditor: (section: SectionType, contentPath: string) => Editor | null;
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
>;

type ReportSectionsContextValue = Pick<
  ReportContextValue,
  "sections" | "updateSection" | "replaceSection"
>;

type ReportPlaceholdersContextValue = Pick<
  ReportContextValue,
  "pendingPlaceholders"
>;

type ReportSectionContextValue<K extends keyof SectionContentMap> = {
  value: SectionContentMap[K];
  update: (updater: (prev: SectionContentMap[K]) => SectionContentMap[K]) => void;
  replace: (next: SectionContentMap[K]) => void;
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
  | "scheduleEvaluation"
  | "isEvaluating"
  | "pendingEvalSections"
  | "runningEvalSections"
  | "setEvaluations"
>;

type ReportEditorsContextValue = Pick<
  ReportContextValue,
  "registerEditor" | "getEditor" | "editorTick"
>;

const ReportDataContext = createContext<ReportDataContextValue | null>(null);
const ReportSectionsContext = createContext<ReportSectionsContextValue | null>(null);
const ReportPlaceholdersContext = createContext<ReportPlaceholdersContextValue | null>(null);
const ReportCommentsContext = createContext<ReportCommentsContextValue | null>(null);
const ReportEvaluationContext = createContext<ReportEvaluationContextValue | null>(null);
const ReportEditorsContext = createContext<ReportEditorsContextValue | null>(null);
const DefineSectionContext = createContext<ReportSectionContextValue<"define"> | null>(null);
const MeasureSectionContext = createContext<ReportSectionContextValue<"measure"> | null>(null);
const AnalyzeSectionContext = createContext<ReportSectionContextValue<"analyze"> | null>(null);
const ImproveSectionContext = createContext<ReportSectionContextValue<"improve"> | null>(null);
const ControlSectionContext = createContext<ReportSectionContextValue<"control"> | null>(null);

function bundleToSections(rows: ReportSectionRecord[]): SectionContents {
  const out: Record<string, unknown> = {};
  for (const section of EDITABLE_SECTIONS) {
    const row = rows.find((r) => r.section === section);
    if (row) {
      out[section] = mergeSection(section, row.content);
    } else {
      out[section] = EMPTY_CONTENT[section];
    }
  }
  return out as SectionContents;
}

export function ReportProvider({
  bundle,
  currentUserId,
  readOnly,
  initialTrackChangesMode = false,
  workspaceMode = "edit",
  children,
}: {
  bundle: ReportBundle;
  currentUserId: string;
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
    bundleToSections(bundle.sections)
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
    bundle.comments.map((c) => ({
      ...c,
      parentId: c.parentId ?? null,
    }))
  );
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [overflowCounts, setOverflowCounts] = useState<
    Partial<Record<SectionType, number>>
  >({});

  /** Gate: auto-eval only fires after the user has triggered at least one
   *  manual evaluation (or the report already has evaluations from a prior
   *  session). */
  const hasManualEvalRef = useRef(bundle.evaluations.length > 0);

  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
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
  const [editorTick, setEditorTick] = useState(0);

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

  const requestCommentFocus = useCallback((commentId: string) => {
    setPendingCommentFocusCommentId(commentId);
    setActiveCommentId(commentId);
    setActiveAnchorId(commentId);
  }, []);

  const acknowledgeCommentFocus = useCallback(() => {
    setPendingCommentFocusCommentId(null);
  }, []);

  const updateSection = useCallback(
    <K extends keyof SectionContentMap>(
      section: K,
      updater: (prev: SectionContentMap[K]) => SectionContentMap[K]
    ) => {
      setSections((prev) => {
        const current = (prev[section] ?? EMPTY_CONTENT[section]) as SectionContentMap[K];
        return { ...prev, [section]: updater(current) };
      });
    },
    []
  );

  const replaceSection = useCallback(
    <K extends keyof SectionContentMap>(
      section: K,
      next: SectionContentMap[K]
    ) => {
      setSections((prev) => ({ ...prev, [section]: next }));
    },
    []
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/reports/${bundle.report.id}`);
    if (!res.ok) return;
    const data = (await res.json()) as ReportBundle;
    setReport(data.report);
    setSectionRows(data.sections);
    setSections(bundleToSections(data.sections));
    setEvaluations(data.evaluations);
    setComments(
      data.comments.map((c: CommentRecord) => ({
        ...c,
        parentId: c.parentId ?? null,
      }))
    );
  }, [bundle.report.id]);

  const getSectionId = useCallback(
    (section: SectionType) =>
      sectionRows.find((r) => r.section === section)?.id ?? null,
    [sectionRows]
  );

  // ─── Auto-evaluation orchestration ──────────────────────────────────────
  //
  // Strategy:
  //   - Each evaluatable section gets a per-section idle timer. If its content
  //     hash changes, we (re)arm the timer. When it fires, we enqueue an
  //     evaluation for that section.
  //   - Direct callers (e.g. accept/ignore a suggestion) can call
  //     `scheduleEvaluation(section, { immediate: true })` to bypass the idle
  //     wait.
  //   - A single FIFO worker drains the queue serially. The server-side hash
  //     dedupe makes "useless" runs cheap, but serializing also keeps cost
  //     predictable when many sections change at once.
  //   - `runEvaluation` is the imperative escape hatch (manual button); it
  //     skips the queue and forces the LLM call by sending reason="manual".

  const lastEvalHashRef = useRef<Map<SectionType, string>>(new Map());
  const idleTimersRef = useRef<Map<SectionType, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const evalQueueRef = useRef<
    { sections: SectionType[]; reason: EvaluationReason }[]
  >([]);
  const isWorkerRunningRef = useRef(false);
  const [pendingEvalSections, setPendingEvalSections] = useState<SectionType[]>(
    []
  );
  const [runningEvalSections, setRunningEvalSections] = useState<SectionType[]>(
    []
  );

  // Mirror of `sections` for callbacks that must read latest draft without widening deps.
  const sectionsRef = useRef<SectionContents>(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const performEvaluation = useCallback(
    async (
      sections: SectionType[] | undefined,
      reason: EvaluationReason
    ): Promise<void> => {
      const targets =
        sections && sections.length > 0 ? sections : [...EVALUATABLE_SECTIONS];
      if (!hasEnoughContextInFirstSection(sectionsRef.current.define)) {
        if (reason === "manual") {
          toast.error(INSUFFICIENT_FIRST_SECTION_MESSAGE);
        }
        return;
      }
      setRunningEvalSections(targets);
      setIsEvaluating(true);
      try {
        const res = await fetch(`/api/reports/${bundle.report.id}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sections: targets, reason }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          // Stay quiet for background runs — only the manual button toasts on
          // failure, otherwise we'd nag the user every minute.
          if (reason === "manual") {
            toast.error(
              errBody.error ??
                "AI evaluation failed. Check that AI_GATEWAY_API_KEY is configured."
            );
          } else {
            console.warn("Background AI evaluation failed", errBody);
          }
          return;
        }
        const data = await res.json();
        setEvaluations(data.evaluations as EvaluationRecord[]);
        // The server may have mutated section content (inline AI marks) and
        // emitted new linked AI comments — apply both atomically so the UI
        // re-renders in sync with the new evaluation set.
        if (Array.isArray(data.sections)) {
          const rows = data.sections as ReportSectionRecord[];
          setSectionRows(rows);
          setSections(bundleToSections(rows));
        }
        if (Array.isArray(data.comments)) {
          setComments(
            (data.comments as CommentRecord[]).map((c) => ({
              ...c,
              parentId: c.parentId ?? null,
            }))
          );
        }
        // Capture overflow counts from the server cap.
        if (data.overflowCounts && typeof data.overflowCounts === "object") {
          setOverflowCounts(
            data.overflowCounts as Partial<Record<SectionType, number>>
          );
        } else {
          setOverflowCounts({});
        }
        // Record the hash we just evaluated so we don't re-fire until the
        // user actually changes something. We hash the content the SERVER now
        // has (post-injection) so the next idle check matches.
        for (const s of targets) {
          const updatedRow = (data.sections as ReportSectionRecord[] | undefined)?.find(
            (r) => r.section === s
          );
          const fallbackRow = sectionRows.find((r) => r.section === s);
          const content =
            updatedRow?.content ??
            (sections == null ? fallbackRow?.content : sectionsRef.current[s] ?? fallbackRow?.content);
          if (content !== undefined) {
            lastEvalHashRef.current.set(s, hashContent(content));
          }
        }
        if (reason === "manual") {
          hasManualEvalRef.current = true;
          toast.success("AI evaluation complete");
        }
      } catch (err) {
        console.error(err);
        if (reason === "manual") toast.error("AI evaluation failed");
      } finally {
        setIsEvaluating(false);
        setRunningEvalSections([]);
      }
    },
    [bundle.report.id, sectionRows]
  );

  const drainQueue = useCallback(async () => {
    if (isWorkerRunningRef.current) return;
    isWorkerRunningRef.current = true;
    try {
      while (evalQueueRef.current.length > 0) {
        const next = evalQueueRef.current.shift()!;
        // Coalesce: merge any further queued items that share the reason and
        // overlap, so we don't run the same section multiple times in a row.
        while (
          evalQueueRef.current.length > 0 &&
          evalQueueRef.current[0].reason === next.reason
        ) {
          const peek = evalQueueRef.current.shift()!;
          for (const s of peek.sections) {
            if (!next.sections.includes(s)) next.sections.push(s);
          }
        }
        // Drop sections from `pendingEvalSections` while they're being run.
        setPendingEvalSections((prev) =>
          prev.filter((s) => !next.sections.includes(s))
        );
        await performEvaluation(next.sections, next.reason);
      }
    } finally {
      isWorkerRunningRef.current = false;
    }
  }, [performEvaluation]);

  const enqueueEvaluation = useCallback(
    (sections: SectionType[], reason: EvaluationReason) => {
      if (sections.length === 0) return;
      if (!hasEnoughContextInFirstSection(sectionsRef.current.define)) return;
      evalQueueRef.current.push({ sections: [...sections], reason });
      void drainQueue();
    },
    [drainQueue]
  );

  const scheduleEvaluation = useCallback(
    (
      section: SectionType | SectionType[],
      opts?: { immediate?: boolean; reason?: EvaluationReason }
    ) => {
      const list = Array.isArray(section) ? section : [section];
      const reason: EvaluationReason = opts?.reason ?? "post-action";
      if (!hasEnoughContextInFirstSection(sectionsRef.current.define)) return;
      if (opts?.immediate) {
        // Cancel any pending idle timers for these sections — the immediate
        // run supersedes them.
        for (const s of list) {
          const t = idleTimersRef.current.get(s);
          if (t) {
            clearTimeout(t);
            idleTimersRef.current.delete(s);
          }
        }
        setPendingEvalSections((prev) => prev.filter((s) => !list.includes(s)));
        enqueueEvaluation(list, reason);
        return;
      }
      // Debounced path: arm/refresh per-section idle timers.
      for (const s of list) {
        const existing = idleTimersRef.current.get(s);
        if (existing) clearTimeout(existing);
        const handle = setTimeout(() => {
          idleTimersRef.current.delete(s);
          setPendingEvalSections((prev) => prev.filter((p) => p !== s));
          enqueueEvaluation([s], "idle");
        }, AUTO_EVAL_IDLE_MS);
        idleTimersRef.current.set(s, handle);
      }
      setPendingEvalSections((prev) => {
        const merged = new Set(prev);
        for (const s of list) merged.add(s);
        return Array.from(merged);
      });
    },
    [enqueueEvaluation]
  );

  const runEvaluation = useCallback(
    async (
      section?: SectionType | SectionType[],
      opts?: { reason?: EvaluationReason }
    ) => {
      const reason: EvaluationReason = opts?.reason ?? "manual";
      const list = section
        ? Array.isArray(section)
          ? section
          : [section]
        : undefined;
      // Cancel any debounced timers for these sections — the explicit run
      // makes them moot.
      if (list) {
        for (const s of list) {
          const t = idleTimersRef.current.get(s);
          if (t) {
            clearTimeout(t);
            idleTimersRef.current.delete(s);
          }
        }
        setPendingEvalSections((prev) => prev.filter((s) => !list.includes(s)));
      }
      await performEvaluation(list, reason);
    },
    [performEvaluation]
  );

  // Seed the last-evaluated hash map on mount and whenever the bundle is
  // refreshed, so the very first edit is what triggers a debounce — not the
  // initial render.
  useEffect(() => {
    for (const s of EVALUATABLE_SECTIONS) {
      const row = sectionRows.find((r) => r.section === s);
      if (row && !lastEvalHashRef.current.has(s)) {
        lastEvalHashRef.current.set(s, hashContent(row.content));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.report.id]);

  // One-shot backfill on report load: trigger a server-side reconcile pass
  // for any section whose active partially_met / not_met evaluation either
  //   - has no linked AI comment yet (legacy rows from before inline
  //     materialization shipped), OR
  //   - has a linked OPEN comment but no inline marks in the section JSON
  //     (legacy Apply flow stripped the marks or the comment was orphaned).
  // The server-side hash check skips the LLM call and just materializes the
  // marks + linked comment, so this is cheap.
  const backfillTriggeredRef = useRef(false);
  useEffect(() => {
    if (readOnly) return;
    if (!hasManualEvalRef.current) return;
    if (backfillTriggeredRef.current) return;
    const linkedOpenByEvalId = new Map<string, true>();
    for (const c of comments) {
      if (c.evaluationId && c.status === "open") {
        linkedOpenByEvalId.set(c.evaluationId, true);
      }
    }
    const docHasMarkForId = (doc: unknown, id: string): boolean => {
      if (!doc || typeof doc !== "object") return false;
      const node = doc as { marks?: { type?: string; attrs?: { id?: string } }[]; content?: unknown[] };
      if (node.marks?.length) {
        for (const m of node.marks) {
          if (
            (m.type === "suggestionInsert" || m.type === "suggestionDelete") &&
            m.attrs?.id === id
          ) {
            return true;
          }
        }
      }
      if (node.content?.length) {
        for (const ch of node.content) {
          if (docHasMarkForId(ch, id)) return true;
        }
      }
      return false;
    };
    const sectionsNeedingBackfill = new Set<SectionType>();
    for (const ev of evaluations) {
      const wantsFix =
        (ev.status === "partially_met" || ev.status === "not_met") &&
        !ev.bypassed &&
        !!ev.suggestedFix?.replacementText?.trim();
      if (!wantsFix) continue;
      const hasOpenLink = linkedOpenByEvalId.has(ev.id);
      if (!hasOpenLink) {
        // No comment yet → definitely needs materialization.
        sectionsNeedingBackfill.add(ev.section);
        continue;
      }
      // Open linked comment exists — check that the inline marks are also
      // in the narrative; if not, the prior materialization was lost.
      const sectionContent = sections[ev.section as keyof typeof sections] as
        | { narrative?: unknown }
        | undefined;
      const narrative = sectionContent?.narrative;
      if (narrative && !docHasMarkForId(narrative, ev.id)) {
        sectionsNeedingBackfill.add(ev.section);
      }
    }
    if (sectionsNeedingBackfill.size === 0) return;
    if (!hasEnoughContextInFirstSection(sections.define)) return;
    backfillTriggeredRef.current = true;
    enqueueEvaluation(Array.from(sectionsNeedingBackfill), "post-action");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.report.id, evaluations, comments, sections, readOnly]);

  // The driver: when the in-memory `sections` content for an evaluatable
  // section diverges from the last-evaluated hash, arm a debounce timer.
  // Gated: no auto-eval until the user has triggered at least one manual run.
  useEffect(() => {
    if (readOnly) return;
    if (!hasManualEvalRef.current) return;
    if (!hasEnoughContextInFirstSection(sections.define)) {
      for (const s of EVALUATABLE_SECTIONS) {
        const t = idleTimersRef.current.get(s);
        if (t) {
          clearTimeout(t);
          idleTimersRef.current.delete(s);
        }
      }
      queueMicrotask(() => {
        setPendingEvalSections([]);
      });
      return;
    }
    for (const s of EVALUATABLE_SECTIONS) {
      const content = sections[s];
      if (content === undefined) continue;
      const currentHash = hashContent(content);
      const lastHash = lastEvalHashRef.current.get(s);
      if (lastHash === currentHash) {
        // Content matches what's already evaluated — make sure no stale timer
        // is left armed.
        const t = idleTimersRef.current.get(s);
        if (t) {
          clearTimeout(t);
          idleTimersRef.current.delete(s);
          setPendingEvalSections((prev) => prev.filter((p) => p !== s));
        }
        continue;
      }
      // Arm/refresh the per-section idle timer.
      scheduleEvaluation(s, { reason: "idle" });
    }
  }, [sections, readOnly, scheduleEvaluation]);

  // Cancel pending timers on unmount / report swap.
  useEffect(() => {
    const timers = idleTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // Scan the live section content for unfilled `<to be filled>` placeholders.
  // Single source of truth for the header badge + Sheet panel + inline highlights.
  const pendingPlaceholders = useMemo(
    () => collectPlaceholders(sections),
    [sections]
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
    () => ({ pendingPlaceholders }),
    [pendingPlaceholders]
  );

  const defineSectionValue = useMemo<ReportSectionContextValue<"define">>(
    () => ({
      value: (sections.define ?? EMPTY_CONTENT.define) as SectionContentMap["define"],
      update: (updater) => updateSection("define", updater),
      replace: (next) => replaceSection("define", next),
    }),
    [sections.define, updateSection, replaceSection]
  );

  const measureSectionValue = useMemo<ReportSectionContextValue<"measure">>(
    () => ({
      value: (sections.measure ?? EMPTY_CONTENT.measure) as SectionContentMap["measure"],
      update: (updater) => updateSection("measure", updater),
      replace: (next) => replaceSection("measure", next),
    }),
    [sections.measure, updateSection, replaceSection]
  );

  const analyzeSectionValue = useMemo<ReportSectionContextValue<"analyze">>(
    () => ({
      value: (sections.analyze ?? EMPTY_CONTENT.analyze) as SectionContentMap["analyze"],
      update: (updater) => updateSection("analyze", updater),
      replace: (next) => replaceSection("analyze", next),
    }),
    [sections.analyze, updateSection, replaceSection]
  );

  const improveSectionValue = useMemo<ReportSectionContextValue<"improve">>(
    () => ({
      value: (sections.improve ?? EMPTY_CONTENT.improve) as SectionContentMap["improve"],
      update: (updater) => updateSection("improve", updater),
      replace: (next) => replaceSection("improve", next),
    }),
    [sections.improve, updateSection, replaceSection]
  );

  const controlSectionValue = useMemo<ReportSectionContextValue<"control">>(
    () => ({
      value: (sections.control ?? EMPTY_CONTENT.control) as SectionContentMap["control"],
      update: (updater) => updateSection("control", updater),
      replace: (next) => replaceSection("control", next),
    }),
    [sections.control, updateSection, replaceSection]
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
      scheduleEvaluation,
      isEvaluating,
      pendingEvalSections,
      runningEvalSections,
      setEvaluations,
    }),
    [
      evaluations,
      overflowCounts,
      runEvaluation,
      scheduleEvaluation,
      isEvaluating,
      pendingEvalSections,
      runningEvalSections,
    ]
  );

  const editorsValue = useMemo<ReportEditorsContextValue>(
    () => ({
      registerEditor,
      getEditor,
      editorTick,
    }),
    [registerEditor, getEditor, editorTick]
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
                    <ReportEvaluationContext.Provider value={evaluationValue}>
                      <ReportCommentsContext.Provider value={commentsValue}>
                        <ReportEditorsContext.Provider value={editorsValue}>
                          {children}
                        </ReportEditorsContext.Provider>
                      </ReportCommentsContext.Provider>
                    </ReportEvaluationContext.Provider>
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

export function useReportSection<K extends keyof SectionContentMap & SectionType>(
  section: K
): ReportSectionContextValue<K> {
  const define = useContext(DefineSectionContext);
  const measure = useContext(MeasureSectionContext);
  const analyze = useContext(AnalyzeSectionContext);
  const improve = useContext(ImproveSectionContext);
  const control = useContext(ControlSectionContext);
  if (!define || !measure || !analyze || !improve || !control) {
    throw new Error("useReportSection must be used within ReportProvider");
  }

  switch (section) {
    case "define":
      return define as unknown as ReportSectionContextValue<K>;
    case "measure":
      return measure as unknown as ReportSectionContextValue<K>;
    case "analyze":
      return analyze as unknown as ReportSectionContextValue<K>;
    case "improve":
      return improve as unknown as ReportSectionContextValue<K>;
    case "control":
      return control as unknown as ReportSectionContextValue<K>;
    default:
      throw new Error(`Unknown report section: ${section}`);
  }
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
