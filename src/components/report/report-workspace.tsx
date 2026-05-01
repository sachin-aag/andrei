"use client";

import { useState, useRef, useCallback, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  useReportComments,
  useReportData,
  useReportPlaceholders,
} from "@/providers/report-provider";
import { ReportHeader } from "./report-header";
import { ReportWorkspaceHeader } from "./report-workspace-header";
import { MarginGutter } from "./review-rail/margin-gutter";
import { CriteriaSheet } from "./criteria-sheet";
import { getUser } from "@/lib/auth/mock-users";
import type { SectionType } from "@/db/schema";
import type { WorkspaceMode } from "@/providers/report-provider";

export type { WorkspaceMode };

function SectionEditorLoading() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="h-5 w-32 rounded bg-[var(--secondary)]" />
      <div className="mt-3 h-24 rounded bg-[var(--secondary)]" />
    </div>
  );
}

const REPORT_WORKSPACE_SECTIONS = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
] as const;

const SECTION_EDITORS = {
  define: dynamic(
    () => import("./sections/define-editor").then((mod) => mod.DefineEditor),
    { loading: SectionEditorLoading }
  ),
  measure: dynamic(
    () => import("./sections/measure-editor").then((mod) => mod.MeasureEditor),
    { loading: SectionEditorLoading }
  ),
  analyze: dynamic(
    () => import("./sections/analyze-editor").then((mod) => mod.AnalyzeEditor),
    { loading: SectionEditorLoading }
  ),
  improve: dynamic(
    () => import("./sections/improve-editor").then((mod) => mod.ImproveEditor),
    { loading: SectionEditorLoading }
  ),
  control: dynamic(
    () => import("./sections/control-editor").then((mod) => mod.ControlEditor),
    { loading: SectionEditorLoading }
  ),
} satisfies Record<(typeof REPORT_WORKSPACE_SECTIONS)[number], ComponentType>;

export function ReportWorkspace({ mode }: { mode: WorkspaceMode }) {
  const {
    report,
    refresh,
    currentUserId,
    trackChangesMode,
    setTrackChangesMode,
  } = useReportData();
  const { pendingPlaceholders } = useReportPlaceholders();
  const { requestCommentFocus } = useReportComments();
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [criteriaSection, setCriteriaSection] = useState<SectionType | undefined>();
  const [sectionMinHeights, setSectionMinHeights] = useState<
    Partial<Record<SectionType, number>>
  >({});
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);

  const handleOpenCriteria = useCallback((section: SectionType) => {
    setCriteriaSection(section);
    setCriteriaOpen(true);
  }, []);

  const handleSectionOverflow = useCallback(
    (overflows: Record<SectionType, number>) => {
      setSectionMinHeights((prev) => {
        // MarginGutter measures absolutely positioned cards and reports how far
        // they extend past each section. Only update when the padding delta
        // actually changes; otherwise measurement can feed back into layout.
        const keys = Object.keys(overflows) as SectionType[];
        const prevKeys = Object.keys(prev) as SectionType[];
        if (
          keys.length === prevKeys.length &&
          keys.every((k) => Math.abs((prev[k] ?? 0) - (overflows[k] ?? 0)) < 2)
        ) {
          return prev;
        }
        return overflows;
      });
    },
    []
  );

  const manager = getUser(report.assignedManagerId ?? undefined);
  const author = getUser(report.authorId);

  const canSubmit =
    mode === "edit" &&
    report.authorId === currentUserId &&
    (report.status === "draft" || report.status === "feedback");

  const canReview =
    mode === "review" &&
    (report.status === "submitted" || report.status === "in_review");

  const warnIfPlaceholders = () => {
    const n = pendingPlaceholders.length;
    if (n > 0) {
      toast.warning(
        `${n} placeholder${n === 1 ? "" : "s"} still unfilled — submitted anyway.`
      );
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/submit`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to submit");
        return;
      }
      toast.success("Report submitted for review");
      warnIfPlaceholders();
      await refresh();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/approve`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to approve");
        return;
      }
      toast.success("Report approved");
      warnIfPlaceholders();
      await refresh();
      router.refresh();
    } finally {
      setApproving(false);
    }
  };

  const handleFeedback = async () => {
    setSendingFeedback(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/feedback`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to return feedback");
        return;
      }
      toast.success("Feedback returned to author");
      await refresh();
      router.refresh();
    } finally {
      setSendingFeedback(false);
    }
  };

  const jumpToSection = (s: SectionType) => {
    const el = mainRef.current?.querySelector(`#${s}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const jumpToComment = (id: string) => {
    requestCommentFocus(id);
  };

  return (
    <div className="flex h-full flex-col">
      <ReportWorkspaceHeader
        report={report}
        mode={mode}
        authorName={author?.name}
        managerName={manager?.name}
        trackChangesMode={trackChangesMode}
        onTrackChangesModeChange={setTrackChangesMode}
        onJumpToSection={jumpToSection}
        onOpenCriteria={() => setCriteriaOpen(true)}
        canSubmit={canSubmit}
        canReview={canReview}
        submitting={submitting}
        approving={approving}
        sendingFeedback={sendingFeedback}
        onSubmit={handleSubmit}
        onApprove={handleApprove}
        onFeedback={handleFeedback}
      />

      <div className="flex-1 overflow-hidden">
        <main
          ref={mainRef}
          className="h-full overflow-auto bg-[var(--background)]"
        >
          <div className="mx-auto px-6 py-8 pb-24 grid gap-8 grid-cols-1 lg:grid-cols-[minmax(0,720px)_360px] lg:max-w-[1180px]">
            <div className="space-y-10 min-w-0">
              <ReportHeader />
              {REPORT_WORKSPACE_SECTIONS.map((s) => {
                const Editor = SECTION_EDITORS[s];
                const extra = sectionMinHeights[s];
                return (
                  <section
                    key={s}
                    id={s}
                    style={extra ? { paddingBottom: `${extra}px` } : undefined}
                  >
                    <Editor />
                  </section>
                );
              })}
            </div>
            <aside
              className="hidden lg:block relative"
              aria-label="Review margin"
            >
              <MarginGutter
                onOpenCriteria={handleOpenCriteria}
                onSectionOverflow={handleSectionOverflow}
              />
            </aside>
          </div>
        </main>
      </div>

      <CriteriaSheet
        open={criteriaOpen}
        onOpenChange={(open) => {
          setCriteriaOpen(open);
          if (!open) setCriteriaSection(undefined);
        }}
        onJumpToSection={jumpToSection}
        onJumpToComment={jumpToComment}
        initialSection={criteriaSection}
      />
    </div>
  );
}
