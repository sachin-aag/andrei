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
import { useReportAttachments } from "@/providers/report-attachments-provider";
import { ReportHeader } from "./report-header";
import { ReportDetailsEditDialog } from "./report-details-edit-dialog";
import { ReportWorkspaceHeader } from "./report-workspace-header";
import { ReportEditorToolbar } from "./report-editor-toolbar";
import { MarginGutter } from "./review-rail/margin-gutter";
import { ReportSidebar, type SidebarTab } from "./report-sidebar";
import { DocumentsPanel } from "./documents/documents-panel";
import { AttachmentViewer } from "./attachment-viewer";
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
import { evaluatableSectionKeys } from "@/lib/ai/criteria-view";
import { getWorkspaceSections } from "@/lib/document-types";
import { captureEvent } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";
import { useWorkspaceLayout } from "@/hooks/use-workspace-layout";
import { WorkspaceResizeHandle } from "./workspace-resize-handle";
import {
  ElectronicSignatureDialog,
  type SignatureMeaningUi,
} from "./electronic-signature-dialog";

export type { WorkspaceMode };

function SectionEditorLoading() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="h-5 w-32 rounded bg-[var(--secondary)]" />
      <div className="mt-3 h-24 rounded bg-[var(--secondary)]" />
    </div>
  );
}

const INVESTIGATION_SECTION_EDITORS: Record<string, ComponentType> = {
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
  conclusion: dynamic(
    () => import("./sections/conclusion-editor").then((mod) => mod.ConclusionEditor),
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
};

const DV_SECTION_EDITORS: Record<string, ComponentType> = {
  cover_page: dynamic(
    () =>
      import("./sections/dv/cover-page-editor").then((mod) => mod.DvCoverPageEditor),
    { loading: SectionEditorLoading }
  ),
  purpose_scope: dynamic(
    () =>
      import("./sections/dv/dv-section-editors").then(
        (mod) => mod.DvPurposeScopeEditor
      ),
    { loading: SectionEditorLoading }
  ),
  references: dynamic(
    () =>
      import("./sections/dv/dv-section-editors").then(
        (mod) => mod.DvReferencesEditor
      ),
    { loading: SectionEditorLoading }
  ),
  traceability: dynamic(
    () =>
      import("./sections/dv/dv-section-editors").then(
        (mod) => mod.DvTraceabilityEditor
      ),
    { loading: SectionEditorLoading }
  ),
  test_methods: dynamic(
    () =>
      import("./sections/dv/dv-section-editors").then(
        (mod) => mod.DvTestMethodsEditor
      ),
    { loading: SectionEditorLoading }
  ),
  test_results: dynamic(
    () =>
      import("./sections/dv/dv-section-editors").then(
        (mod) => mod.DvTestResultsEditor
      ),
    { loading: SectionEditorLoading }
  ),
  deviations: dynamic(
    () =>
      import("./sections/dv/dv-section-editors").then(
        (mod) => mod.DvDeviationsEditor
      ),
    { loading: SectionEditorLoading }
  ),
  conclusion: dynamic(
    () =>
      import("./sections/dv/dv-section-editors").then(
        (mod) => mod.DvConclusionEditor
      ),
    { loading: SectionEditorLoading }
  ),
  approval_signoff: dynamic(
    () =>
      import("./sections/dv/dv-section-editors").then((mod) => mod.DvApprovalEditor),
    { loading: SectionEditorLoading }
  ),
  appendices: dynamic(
    () =>
      import("./sections/dv/dv-section-editors").then(
        (mod) => mod.DvAppendicesEditor
      ),
    { loading: SectionEditorLoading }
  ),
};

/** @deprecated Prefer INVESTIGATION_SECTION_EDITORS / DV_SECTION_EDITORS */
const SECTION_EDITORS = INVESTIGATION_SECTION_EDITORS;

export function ReportWorkspace({
  mode,
}: {
  mode: WorkspaceMode;
}) {
  const {
    report,
    setReport,
    readOnly,
    refresh,
    currentUserId,
    trackChangesMode,
    setTrackChangesMode,
    flushPendingSectionSaves,
  } = useReportData();
  const { pendingPlaceholders } = useReportPlaceholders();
  const { getEditor } = useReportEditors();
  const { requestCommentFocus, comments } = useReportComments();
  const { suggestionsFocusSection, clearSuggestionsFocusSection } =
    useReportEvaluations();
  const { activeAttachmentId } = useReportAttachments();
  const [criteriaFocusSection, setCriteriaFocusSection] = useState<
    SectionType | undefined
  >();
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [signDialog, setSignDialog] = useState<SignatureMeaningUi | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [detailsFormKey, setDetailsFormKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [documentsCollapsed, setDocumentsCollapsed] = useState(false);
  const {
    containerRef,
    isResizing,
    chatWidth,
    docsWidth,
    chatBounds,
    docsBounds,
    setChatWidth,
    setDocsWidth,
    resetChatWidth,
    resetDocsWidth,
    beginResize,
    endResize,
  } = useWorkspaceLayout({
    chatCollapsed: sidebarCollapsed,
    docsCollapsed: documentsCollapsed,
  });
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("assistant");
  const [sectionMinHeights, setSectionMinHeights] = useState<
    Partial<Record<SectionType, number>>
  >({});
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);
  const documentType = report.documentType;
  const handleSectionOverflow = useCallback(
    (overflows: Record<SectionType, number>) => {
      setSectionMinHeights((prev) => {
        const next: Partial<Record<SectionType, number>> = {};
        let changed = false;

        for (const section of evaluatableSectionKeys(documentType)) {
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
    [documentType]
  );

  const { getUser, users } = useUserDirectory();
  const managers = users.filter((user) => user.role === "manager");
  const assignedManagerIds =
    (report.assignedManagerIds?.length ?? 0) > 0
      ? report.assignedManagerIds ?? []
      : report.assignedManagerId
        ? [report.assignedManagerId]
        : [];
  const managerNames = assignedManagerIds
    .map((id) => getUser(id)?.name)
    .filter((name): name is string => Boolean(name));
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
    setSignDialog("submission");
  };

  const handleApprove = async () => {
    setSignDialog("approval");
  };

  const handleFeedback = async () => {
    setSignDialog("rejection");
  };

  const runSignedAction = async ({
    userId,
    password,
  }: {
    userId: string;
    password: string;
  }) => {
    if (!signDialog) return;

    const endpoints: Record<SignatureMeaningUi, string> = {
      submission: "submit",
      approval: "approve",
      rejection: "feedback",
    };

    const setLoading = {
      submission: setSubmitting,
      approval: setApproving,
      rejection: setSendingFeedback,
    }[signDialog];

    setLoading(true);
    try {
      if (signDialog === "submission") {
        try {
          await flushPendingSectionSaves();
        } catch {
          toast.error("Could not save pending edits. Fix save errors, then submit again.");
          return;
        }
      }

      const endpoint = endpoints[signDialog];
      const res = await fetch(`/api/reports/${report.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Signing failed");
        return;
      }

      if (signDialog === "submission") {
        captureEvent("report_submitted", { reportId: report.id });
        toast.success("Report submitted for review");
        warnIfPlaceholders();
      } else if (signDialog === "approval") {
        captureEvent("report_approved", { reportId: report.id });
        toast.success("Report approved");
        warnIfPlaceholders();
      } else {
        captureEvent("report_feedback_sent", { reportId: report.id });
        toast.success("Feedback returned to author");
      }

      setSignDialog(null);
      await refresh();
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const signingInFlight = submitting || approving || sendingFeedback;

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
    jumpToSection,
  ]);

  const jumpToComment = useCallback(
    (id: string) => {
      const root = comments.find((c) => c.id === id && !c.parentId);
      if (!root) return;

      // Set focus state first — this also tells the margin-gutter which card
      // is active (it will skip its own scroll because we pass skipAutoScroll).
      requestCommentFocus(id);

      // Wait for the gutter to re-render with updated positions, then do a
      // single smooth scroll to the gutter card.  Because the gutter card is
      // positioned at the same vertical offset as the document field, this
      // also brings the corresponding section text into view.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const gutterId = gutterAnchorIdForComment(root);
          const scrolled = scrollToGutterAnchor(gutterId);
          if (!scrolled) {
            // Gutter card not found — fall back to the field anchor or section.
            const scrolledField = scrollToCommentFieldAnchor(root);
            if (!scrolledField && root.section) {
              jumpToSection(root.section);
            }
          }
        })
      );
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
      <ElectronicSignatureDialog
        open={signDialog != null}
        meaning={signDialog ?? "submission"}
        defaultUserId={getUser(currentUserId)?.email ?? ""}
        loading={signingInFlight}
        onOpenChange={(open) => {
          if (!open && !signingInFlight) setSignDialog(null);
        }}
        onConfirm={runSignedAction}
      />
      <ReportDetailsEditDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        report={report}
        managers={managers}
        onSaved={setReport}
        formKey={detailsFormKey}
      />
      <ReportWorkspaceHeader
        report={report}
        mode={mode}
        authorName={author?.name}
        managerNames={managerNames}
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
        auditHref={mode === "view" ? `/reports/${report.id}/audit` : undefined}
        backHref={mode === "view" ? "/admin/reports" : "/"}
        backLabel={mode === "view" ? "Admin Reports" : "Reports"}
        canEditDetails={mode === "edit" && !readOnly}
        onEditDetails={() => {
          setDetailsFormKey((key) => key + 1);
          setDetailsDialogOpen(true);
        }}
      />

      <ReportEditorToolbar />

      <div
        ref={containerRef}
        className={cn(
          "relative flex min-h-0 flex-1 overflow-hidden",
          isResizing && "select-none"
        )}
      >
        <div
          className={cn(
            "relative z-10 h-full shrink-0",
            !isResizing && "transition-[width] duration-200 ease-in-out"
          )}
          style={{ width: docsWidth }}
        >
          <DocumentsPanel
            collapsed={documentsCollapsed}
            onToggleCollapse={() => setDocumentsCollapsed((c) => !c)}
          />
          {documentsCollapsed ? null : (
            <WorkspaceResizeHandle
              label="Resize documents panel"
              controlsId="report-documents-panel"
              edge="end"
              value={docsWidth}
              min={docsBounds.min}
              max={docsBounds.max}
              onChange={setDocsWidth}
              onDragStart={() => beginResize("docs")}
              onDragEnd={endResize}
              onReset={resetDocsWidth}
            />
          )}
        </div>

        <main
          ref={mainRef}
          className="@container min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--background)]"
        >
          <div className="mx-auto grid w-full min-w-0 grid-cols-1 gap-8 px-6 py-8 pb-24 max-w-[1180px] @[800px]:grid-cols-[minmax(0,1fr)_minmax(200px,360px)]">
            <div className="space-y-10 min-w-0">
              <ReportHeader />
              {activeAttachmentId ? (
                <AttachmentViewer />
              ) : (
                getWorkspaceSections(report.documentType).map((section) => {
                  const s = section.key;
                  const Editor =
                    report.documentType === "design_verification"
                      ? DV_SECTION_EDITORS[s]
                      : INVESTIGATION_SECTION_EDITORS[s];
                  if (!Editor) return null;
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
                })
              )}
            </div>
            <aside
              className="relative hidden @[800px]:block"
              aria-label="Review margin"
            >
              <MarginGutter
                onSectionOverflow={handleSectionOverflow}
              />
            </aside>
          </div>
        </main>

        <div
          className={cn(
            "relative z-10 h-full shrink-0",
            !isResizing && "transition-[width] duration-200 ease-in-out"
          )}
          style={{ width: chatWidth }}
        >
          <ReportSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapse}
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            onJumpToSection={jumpToSection}
            onJumpToPlaceholder={handleJumpToPlaceholder}
            onJumpToComment={jumpToComment}
            initialCriteriaSection={criteriaFocusSection}
          />
          {sidebarCollapsed ? null : (
            <WorkspaceResizeHandle
              label="Resize assistant panel"
              controlsId="report-chat-sidebar"
              edge="start"
              value={chatWidth}
              min={chatBounds.min}
              max={chatBounds.max}
              onChange={setChatWidth}
              onDragStart={() => beginResize("chat")}
              onDragEnd={endResize}
              onReset={resetChatWidth}
            />
          )}
        </div>
      </div>
    </div>
  );
}
