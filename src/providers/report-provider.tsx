"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
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

type SectionContents = Partial<{
  [K in keyof SectionContentMap]: SectionContentMap[K];
}>;

export type WorkspaceMode = "edit" | "review";

type ReportContextValue = {
  report: ReportRecord;
  sections: SectionContents;
  sectionRows: ReportSectionRecord[];
  evaluations: EvaluationRecord[];
  comments: CommentRecord[];
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
  updateSection: <K extends keyof SectionContentMap>(
    section: K,
    updater: (prev: SectionContentMap[K]) => SectionContentMap[K]
  ) => void;
  replaceSection: <K extends keyof SectionContentMap>(
    section: K,
    next: SectionContentMap[K]
  ) => void;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  runEvaluation: (section?: SectionType | SectionType[]) => Promise<void>;
  isEvaluating: boolean;
  setEvaluations: React.Dispatch<React.SetStateAction<EvaluationRecord[]>>;
  setComments: React.Dispatch<React.SetStateAction<CommentRecord[]>>;
  refresh: () => Promise<void>;
  getSectionId: (section: SectionType) => string | null;
};

const ReportContext = createContext<ReportContextValue | null>(null);

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
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingCommentFocusCommentId, setPendingCommentFocusCommentId] = useState<string | null>(
    null
  );

  const requestCommentFocus = useCallback((commentId: string) => {
    setPendingCommentFocusCommentId(commentId);
    setActiveCommentId(commentId);
  }, []);

  const acknowledgeCommentFocus = useCallback(() => {
    setPendingCommentFocusCommentId(null);
  }, []);

  useEffect(() => {
    setTrackChangesMode(initialTrackChangesMode);
  }, [bundle.report.id, initialTrackChangesMode]);

  useEffect(() => {
    setSections(bundleToSections(sectionRows));
  }, [sectionRows]);

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

  const runEvaluation = useCallback(
    async (section?: SectionType | SectionType[]) => {
      setIsEvaluating(true);
      try {
        const body: { sections?: SectionType[] } = {};
        if (section) {
          body.sections = Array.isArray(section) ? section : [section];
        }
        const res = await fetch(`/api/reports/${bundle.report.id}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          toast.error(
            errBody.error ??
              "AI evaluation failed. Check that AI_GATEWAY_API_KEY is configured."
          );
          return;
        }
        const data = await res.json();
        setEvaluations(data.evaluations as EvaluationRecord[]);
        toast.success("AI evaluation complete");
      } catch (err) {
        console.error(err);
        toast.error("AI evaluation failed");
      } finally {
        setIsEvaluating(false);
      }
    },
    [bundle.report.id]
  );

  const value = useMemo<ReportContextValue>(
    () => ({
      report,
      sections,
      sectionRows,
      evaluations,
      comments,
      readOnly,
      trackChangesMode,
      setTrackChangesMode,
      workspaceMode,
      currentUserId,
      activeCommentId,
      setActiveCommentId,
      pendingCommentFocusCommentId,
      requestCommentFocus,
      acknowledgeCommentFocus,
      updateSection,
      replaceSection,
      setReport,
      runEvaluation,
      isEvaluating,
      setEvaluations,
      setComments,
      refresh,
      getSectionId,
    }),
    [
      report,
      sections,
      sectionRows,
      evaluations,
      comments,
      readOnly,
      trackChangesMode,
      setTrackChangesMode,
      workspaceMode,
      currentUserId,
      activeCommentId,
      pendingCommentFocusCommentId,
      requestCommentFocus,
      acknowledgeCommentFocus,
      updateSection,
      replaceSection,
      runEvaluation,
      isEvaluating,
      refresh,
      getSectionId,
    ]
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReport() {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error("useReport must be used within ReportProvider");
  return ctx;
}
