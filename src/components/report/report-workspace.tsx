"use client";

import { useState, useRef, useCallback, useEffect, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  useReportComments,
  useReportData,
  useReportEditors,
  useReportEvaluations,
  useReportPlaceholders,
} from "@/providers/report-provider";
import { ReportHeader } from "./report-header";
import { ReportWorkspaceHeader } from "./report-workspace-header";
import { ReportEditorToolbar } from "./report-editor-toolbar";
import { MarginGutter } from "./review-rail/margin-gutter";
import { ReportSidebar, type SidebarTab } from "./report-sidebar";
import { useUserDirectory } from "@/providers/user-directory-provider";
import type { SectionType } from "@/db/schema";
import type { WorkspaceMode } from "@/providers/report-provider";
import type { Placeholder } from "@/lib/placeholders/find";
import { resolvePlaceholderInPmDoc } from "@/lib/placeholders/resolve-in-doc";
import {
  gutterAnchorIdForComment,
  scrollToCommentFieldAnchor,
  scrollToGutterAnchor,
} from "@/lib/comments/navigate";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { REPORT_WORKSPACE_SECTIONS } from "@/types/sections";

export type { WorkspaceMode };

function SectionEditorLoading() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="h-5 w-32 rounded bg-[var(--secondary)]" />
      <div className="mt-3 h-24 rounded bg-[var(--secondary)]" />
    </div>
  );
}

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
  documents_reviewed: dynamic(
    () =>
      import("./sections/documents-reviewed-editor").then(
        (mod) => mod.DocumentsReviewedEditor
      ),
    { loading: SectionEditorLoading }
  ),
  attachments: dynamic(
    () =>
      import("./sections/attachments-editor").then((mod) => mod.AttachmentsEditor),
    { loading: SectionEditorLoading }
  ),
  signature_approvals: dynamic(
    () =>
      import("./sections/signature-approvals-section").then(
        (mod) => mod.SignatureApprovalsSection
      ),
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
  const { getEditor } = useReportEditors();
  const { requestCommentFocus, comments } = useReportComments();
  const { suggestionsFocusSection, clearSuggestionsFocusSection } =
    useReportEvaluations();
  const [criteriaFocusSection, setCriteriaFocusSection] = useState<
    SectionType | undefined
  >();
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("criteria");
  const [sectionMinHeights, setSectionMinHeights] = useState<
    Partial<Record<SectionType, number>>
  >({});
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);
  const handleSectionOverflow = useCallback(
    (overflows: Record<SectionType, number>) => {
      setSectionMinHeights((prev) => {
        const next: Partial<Record<SectionType, number>> = {};
        let changed = false;

        for (const section of EVALUATABLE_SECTIONS) {
          const delta = overflows[section];
          if (delta != null && delta > 1) {
            next[section] = Math.ceil(delta);
          }
          const prevVal = prev[section] ?? 0;
          const nextVal = next[section] ?? 0;
          if (Math.abs(prevVal - nextVal) >= 2) {
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    },
    []
  );

  const { getUser } = useUserDirectory();
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

  const jumpToSection = useCallback((s: SectionType) => {
    const el = mainRef.current?.querySelector(`#${s}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (!suggestionsFocusSection) return;
    const frame = requestAnimationFrame(() => {
      setCriteriaFocusSection(suggestionsFocusSection);
      setSidebarCollapsed(false);
      setSidebarTab("placeholders");
      jumpToSection(suggestionsFocusSection);
      clearSuggestionsFocusSection();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    suggestionsFocusSection,
    clearSuggestionsFocusSection,
  ]);

  const jumpToComment = useCallback(
    (id: string) => {
      const root = comments.find((c) => c.id === id && !c.parentId);
      requestCommentFocus(id);

      if (!root) return;

      if (root.section) {
        jumpToSection(root.section);
      }

      const reveal = () => {
        scrollToCommentFieldAnchor(root);
        scrollToGutterAnchor(gutterAnchorIdForComment(root));
      };

      requestAnimationFrame(() => requestAnimationFrame(reveal));
    },
    [comments, jumpToSection, requestCommentFocus]
  );

  const handleJumpToPlaceholder = (p: Placeholder) => {
    jumpToSection(p.section);
    requestAnimationFrame(() => {
      if (p.contentPath !== "narrative") {
        const anchor = document.querySelector(
          `[data-field-anchor="${p.section}.${p.contentPath}"]`
        );
        if (anchor instanceof HTMLTextAreaElement) {
          anchor.scrollIntoView({ behavior: "smooth", block: "center" });
          anchor.focus();
          anchor.setSelectionRange(p.fromPos, p.toPos);
        } else {
          anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      const editor = getEditor(p.section, p.contentPath);
      if (!editor) return;
      const live = resolvePlaceholderInPmDoc(editor.state.doc, p);
      if (!live) return;
      editor
        .chain()
        .focus()
        .setTextSelection({ from: live.fromPos, to: live.toPos })
        .run();
    });
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((c) => !c);
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
        canSubmit={canSubmit}
        canReview={canReview}
        submitting={submitting}
        approving={approving}
        sendingFeedback={sendingFeedback}
        onSubmit={handleSubmit}
        onApprove={handleApprove}
        onFeedback={handleFeedback}
      />

      <ReportEditorToolbar />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main
          ref={mainRef}
          className="min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--background)]"
        >
          <div className="mx-auto grid grid-cols-1 gap-8 px-6 py-8 pb-24 lg:max-w-[1180px] lg:grid-cols-[minmax(560px,720px)_360px]">
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
                onSectionOverflow={handleSectionOverflow}
              />
            </aside>
          </div>
        </main>

        <ReportSidebar
          collapsed={sidebarCollapsed}
          overlaysWorkspace={!sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          onJumpToSection={jumpToSection}
          onJumpToPlaceholder={handleJumpToPlaceholder}
          onJumpToComment={jumpToComment}
          initialCriteriaSection={criteriaFocusSection}
        />
      </div>
    </div>
  );
}
