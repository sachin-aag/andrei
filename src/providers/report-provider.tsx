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

type SectionContents = Partial<{
  [K in keyof SectionContentMap]: SectionContentMap[K];
}>;

type ReportContextValue = {
  report: ReportRecord;
  sections: SectionContents;
  sectionRows: ReportSectionRecord[];
  evaluations: EvaluationRecord[];
  comments: CommentRecord[];
  readOnly: boolean;
  currentUserId: string;
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
      out[section] = mergeWithEmpty(section, row.content);
    } else {
      out[section] = EMPTY_CONTENT[section];
    }
  }
  return out as SectionContents;
}

function mergeWithEmpty<K extends keyof SectionContentMap>(
  section: K,
  content: unknown
): SectionContentMap[K] {
  const base = EMPTY_CONTENT[section] as SectionContentMap[K];
  if (!content || typeof content !== "object") return base;
  return deepMerge(base, content as Partial<SectionContentMap[K]>);
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  if (Array.isArray(base)) {
    return (Array.isArray(override) ? override : base) as T;
  }
  if (typeof base !== "object" || base === null) {
    return (override ?? base) as T;
  }
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries((override as Record<string, unknown>) ?? {})) {
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      out[k] !== null
    ) {
      out[k] = deepMerge(out[k] as unknown, v as Partial<unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function ReportProvider({
  bundle,
  currentUserId,
  readOnly,
  children,
}: {
  bundle: ReportBundle;
  currentUserId: string;
  readOnly: boolean;
  children: React.ReactNode;
}) {
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
  const [comments, setComments] = useState<CommentRecord[]>(bundle.comments);
  const [isEvaluating, setIsEvaluating] = useState(false);

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
    setComments(data.comments);
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
      currentUserId,
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
      currentUserId,
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
