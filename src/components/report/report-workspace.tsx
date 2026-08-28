"use client";

import { useState, useRef, useCallback, useEffect, type ComponentType } from "react";
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
import { RequestExpertReviewDialog } from "./request-expert-review-dialog";
import type { WorkspaceChrome, WorkProductView } from "./workspace-chrome";
import { WorkProductTabs } from "./work-product-tabs";
import { DocumentRevisionHistory } from "./document-revision-history";
import { DocumentRevisionDiff } from "./document-revision-diff";
import { ReportEditorToolbar } from "./report-editor-toolbar";
import { MarginGutter } from "./review-rail/margin-gutter";
import { ReportSidebar, type SidebarTab } from "./report-sidebar";
import { DocumentsPanel } from "./documents/documents-panel";
import { AttachmentViewer } from "./attachment-viewer";
import { StatisticalWorkspace } from "@/components/statistical-analysis/workspace";
import { useUserDirectory } from "@/providers/user-directory-provider";
import type { DocumentType, SectionType } from "@/db/schema";
import type { WorkspaceMode } from "@/providers/report-provider";
import type { Placeholder } from "@/lib/placeholders/find";
import { resolvePlaceholderInPmDoc } from "@/lib/placeholders/resolve-in-doc";
import {
  gutterAnchorIdForComment,
  scrollToCommentFieldAnchor,
  scrollToGutterAnchor,
} from "@/lib/comments/navigate";
import { suggestionCardSectionKeys } from "@/lib/ai/criteria-view";
import { getDocumentType, getWorkspaceSections, workspacePresentationFor } from "@/lib/document-types";
import { scrollToGeneratedSuggestion } from "@/lib/suggestions/navigate-suggestion";
import { captureEvent } from "@/lib/analytics/events";
import { getCustomerPack, isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import {
  isHiddenExpertReviewer,
  managersVisibleInPicker,
  visibleManagerNames,
} from "@/lib/reports/hidden-expert-reviewer";
import { canSaveReportSection } from "@/lib/reports/access";
import { cn } from "@/lib/utils";
import { useWorkspaceLayout } from "@/hooks/use-workspace-layout";
import { WorkspaceResizeHandle } from "./workspace-resize-handle";
import {
  isReviewGutterVisible,
  REVIEW_GUTTER_GRID_COLS,
  WORKSPACE_PANEL_WIDTH_TRANSITION_MS,
} from "./workspace-layout";
import {
  ElectronicSignatureDialog,
  type SignatureMeaningUi,
} from "./electronic-signature-dialog";
import { DefineEditor } from "./sections/define-editor";
import { MeasureEditor } from "./sections/measure-editor";
import { AnalyzeEditor } from "./sections/analyze-editor";
import { ImproveEditor } from "./sections/improve-editor";
import { ControlEditor } from "./sections/control-editor";
import { ConclusionEditor } from "./sections/conclusion-editor";
import { DocumentsReviewedEditor } from "./sections/documents-reviewed-editor";
import { AttachmentsEditor } from "./sections/attachments-editor";
import { SignatureApprovalsSection } from "./sections/signature-approvals-section";
import { DvCoverPageEditor } from "./sections/dv/cover-page-editor";
import {
  DvAppendicesEditor,
  DvApprovalEditor,
  DvConclusionEditor,
  DvDeviationsEditor,
  DvMethodsOfMeasurementEditor,
  DvProblemsResolutionEditor,
  DvPurposeEditor,
  DvPurposeScopeEditor,
  DvReferencesEditor,
  DvResultsAndDiscussionsEditor,
  DvScopeEditor,
  DvTestEquipmentEditor,
  DvTestMethodsEditor,
  DvTestResultsEditor,
  DvTestersDatesEditor,
  DvTraceabilityEditor,
} from "./sections/dv/dv-section-editors";
import {
  MechConclusionEditor,
  MechDataCollectionFormsEditor,
  MechExecutedProtocolEditor,
  MechFailureFormsEditor,
  MechObservationsEditor,
  MechProblemsResolutionEditor,
  MechProtocolDeviationsEditor,
  MechPurposeEditor,
  MechRequirementsVerifiedEditor,
  MechRevisionHistoryEditor,
  MechScopeEditor,
  MechTestEquipmentEditor,
  MechTestersDatesEditor,
  MechUnitsUnderTestEditor,
} from "./sections/dv/mechanical-section-editors";
import { GenericDocumentEditor } from "./sections/generic/generic-document-editor";
import {
  QraApproachEditor,
  QraCommunicationEditor,
  QraFmeaEditor,
  QraMitigationEditor,
  QraObjectiveEditor,
  QraOverviewEditor,
  QraPeriodicReviewEditor,
  QraPostConclusionEditor,
  QraPreConclusionEditor,
  QraProcedureEditor,
  QraResidualRiskEditor,
  QraRevisionHistoryEditor,
  QraRiskIdentificationEditor,
  QraScopeEditor,
  QraTeamEditor,
} from "./sections/qra/qra-section-editors";

export type { WorkspaceMode };

/**
 * Section editors are all rendered at once, so they must not be lazy: a lazy
 * boundary that has not loaded when React hydrates makes React throw away the
 * server-rendered section and replace it with a fallback, silently discarding
 * focus and keystrokes typed into it.
 */
const INVESTIGATION_SECTION_EDITORS: Record<string, ComponentType> = {
  define: DefineEditor,
  measure: MeasureEditor,
  analyze: AnalyzeEditor,
  improve: ImproveEditor,
  control: ControlEditor,
  conclusion: ConclusionEditor,
  documents_reviewed: DocumentsReviewedEditor,
  attachments: AttachmentsEditor,
  signature_approvals: SignatureApprovalsSection,
};

const DV_SECTION_EDITORS: Record<string, ComponentType> = {
  cover_page: DvCoverPageEditor,
  purpose_scope: DvPurposeScopeEditor,
  references: DvReferencesEditor,
  traceability: DvTraceabilityEditor,
  test_methods: DvTestMethodsEditor,
  test_results: DvTestResultsEditor,
  deviations: DvDeviationsEditor,
  conclusion: DvConclusionEditor,
  approval_signoff: DvApprovalEditor,
  appendices: DvAppendicesEditor,
  purpose: DvPurposeEditor,
  scope: DvScopeEditor,
  testers_dates: DvTestersDatesEditor,
  methods_of_measurement: DvMethodsOfMeasurementEditor,
  test_equipment: DvTestEquipmentEditor,
  results_and_discussions: DvResultsAndDiscussionsEditor,
  problems_resolution: DvProblemsResolutionEditor,
};

const MECHANICAL_DV_SECTION_EDITORS: Record<string, ComponentType> = {
  purpose: MechPurposeEditor,
  scope: MechScopeEditor,
  testers_dates: MechTestersDatesEditor,
  executed_protocol: MechExecutedProtocolEditor,
  protocol_deviations: MechProtocolDeviationsEditor,
  units_under_test: MechUnitsUnderTestEditor,
  equipment_and_calibration: MechTestEquipmentEditor,
  failure_forms: MechFailureFormsEditor,
  data_collection_forms: MechDataCollectionFormsEditor,
  requirements_verified: MechRequirementsVerifiedEditor,
  observations: MechObservationsEditor,
  problems_resolution: MechProblemsResolutionEditor,
  conclusion: MechConclusionEditor,
  revision_history: MechRevisionHistoryEditor,
};

const QRA_SECTION_EDITORS: Record<string, ComponentType> = {
  qra_approach: QraApproachEditor,
  qra_objective: QraObjectiveEditor,
  qra_scope: QraScopeEditor,
  qra_overview: QraOverviewEditor,
  qra_procedure: QraProcedureEditor,
  qra_team: QraTeamEditor,
  qra_risk_identification: QraRiskIdentificationEditor,
  qra_fmea: QraFmeaEditor,
  qra_communication: QraCommunicationEditor,
  qra_pre_conclusion: QraPreConclusionEditor,
  qra_mitigation: QraMitigationEditor,
  qra_residual_risk: QraResidualRiskEditor,
  qra_periodic_review: QraPeriodicReviewEditor,
  qra_post_conclusion: QraPostConclusionEditor,
  qra_revision_history: QraRevisionHistoryEditor,
};

const SECTION_EDITORS_BY_DOCUMENT_TYPE: Record<
  DocumentType,
  Record<string, ComponentType>
> = {
  investigation_report: INVESTIGATION_SECTION_EDITORS,
  design_verification: DV_SECTION_EDITORS,
  mechanical_design_verification: MECHANICAL_DV_SECTION_EDITORS,
  generic_document: { body: GenericDocumentEditor },
  quality_risk_assessment: QRA_SECTION_EDITORS,
};

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
    currentUserEmail,
    currentUserRole,
    flushPendingSectionSaves,
  } = useReportData();
  const { pendingPlaceholders } = useReportPlaceholders();
  const { getEditor } = useReportEditors();
  const { requestCommentFocus, comments } = useReportComments();
  const { suggestionsFocus, clearSuggestionsFocus } = useReportEvaluations();
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
  const [expertReviewOpen, setExpertReviewOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [documentsCollapsed, setDocumentsCollapsed] = useState(false);
  const [chrome, setChrome] = useState<WorkspaceChrome>("document");
  const [workProductView, setWorkProductView] =
    useState<WorkProductView>("report");
  const [compare, setCompare] = useState<{ from: number; to: number } | null>(
    null
  );
  const agentChrome = chrome === "agent";
  const {
    containerRef,
    isResizing,
    chatWidth,
    docsWidth,
    previewWidth,
    chatBounds,
    docsBounds,
    previewBounds,
    setChatWidth,
    setDocsWidth,
    setPreviewWidth,
    resetChatWidth,
    resetDocsWidth,
    resetPreviewWidth,
    beginResize,
    endResize,
  } = useWorkspaceLayout({
    reportId: report.id,
    chrome,
    chatCollapsed: agentChrome ? false : sidebarCollapsed,
    docsCollapsed: documentsCollapsed,
  });
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("assistant");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsReloadEpoch, setAnalyticsReloadEpoch] = useState(0);
  const [analyticsAgentBusy, setAnalyticsAgentBusy] = useState(false);
  const [sectionMinHeights, setSectionMinHeights] = useState<
    Partial<Record<SectionType, number>>
  >({});
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);
  const gutterScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const documentType = report.documentType;
  const continuousDocument =
    workspacePresentationFor(getDocumentType(documentType)).kind ===
    "continuous_document";
  const statsEnabled = isStatisticalAnalysisEnabled();
  const analyticsSurface = workProductView === "analytics";
  const comparing = compare != null;
  const analyticsCanEdit = canSaveReportSection(
    { id: currentUserId, role: currentUserRole, email: currentUserEmail },
    report
  );
  const viewingDocument = !!activeAttachmentId;
  const hideReportEditors =
    analyticsSurface || viewingDocument || comparing;
  const showReviewGutter =
    !analyticsSurface &&
    !comparing &&
    isReviewGutterVisible(sidebarCollapsed, viewingDocument);
  const handleSectionOverflow = useCallback(
    (overflows: Record<SectionType, number>) => {
      setSectionMinHeights((prev) => {
        const next: Partial<Record<SectionType, number>> = {};
        let changed = false;

        for (const section of suggestionCardSectionKeys(documentType)) {
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
  const managers = managersVisibleInPicker(users);
  const assignedManagerIds =
    (report.assignedManagerIds?.length ?? 0) > 0
      ? report.assignedManagerIds ?? []
      : report.assignedManagerId
        ? [report.assignedManagerId]
        : [];
  const usersById = Object.fromEntries(
    users.map((user) => [user.id, { name: user.name, email: user.email }])
  );
  const managerNames = visibleManagerNames(assignedManagerIds, usersById);
  const author = getUser(report.authorId);
  const showExpertReview =
    getCustomerPack().expertReviewEnabled &&
    mode === "edit" &&
    report.authorId === currentUserId &&
    report.status !== "approved" &&
    !isHiddenExpertReviewer({ email: currentUserEmail });

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
      try {
        await flushPendingSectionSaves();
      } catch {
        toast.error(
          "Could not save pending edits. Fix save errors, then try again."
        );
        return;
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

  useEffect(() => {
    if (chrome === "agent") setSidebarCollapsed(false);
  }, [chrome]);

  const jumpToSection = useCallback((s: SectionType) => {
    const el = mainRef.current?.querySelector(`#${s}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    return () => {
      if (gutterScrollTimeoutRef.current != null) {
        clearTimeout(gutterScrollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!suggestionsFocus) return;
    const { section, commentId } = suggestionsFocus;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCriteriaFocusSection(section);
      // Suggestions live in the review margin. Keep the assistant collapsed
      // so the gutter is visible — do not auto-open the right panel.
      setSidebarCollapsed(true);
    });
    const timeouts: Array<ReturnType<typeof setTimeout>> = [];
    const retryDelaysMs = [0, 50, 100, 200];

    const finish = (scrolled: boolean) => {
      if (cancelled) return;
      if (!scrolled) jumpToSection(section);
      clearSuggestionsFocus();
    };

    const attempt = (index: number) => {
      if (cancelled) return;
      const active = comments.find((c) => c.id === commentId) ?? null;
      if (active) {
        requestCommentFocus(active.id);
        if (scrollToGeneratedSuggestion(active)) {
          finish(true);
          return;
        }
      }
      const next = index + 1;
      if (next >= retryDelaysMs.length) {
        finish(false);
        return;
      }
      timeouts.push(setTimeout(() => attempt(next), retryDelaysMs[next]));
    };

    const start = () => {
      if (cancelled) return;
      attempt(0);
    };

    const gutterAlreadyVisible = isReviewGutterVisible(
      sidebarCollapsed,
      viewingDocument
    );
    if (gutterScrollTimeoutRef.current != null) {
      clearTimeout(gutterScrollTimeoutRef.current);
      gutterScrollTimeoutRef.current = null;
    }
    if (gutterAlreadyVisible) {
      let innerFrame = 0;
      const outerFrame = requestAnimationFrame(() => {
        innerFrame = requestAnimationFrame(start);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(outerFrame);
        cancelAnimationFrame(innerFrame);
        for (const id of timeouts) clearTimeout(id);
      };
    }
    gutterScrollTimeoutRef.current = setTimeout(() => {
      gutterScrollTimeoutRef.current = null;
      start();
    }, WORKSPACE_PANEL_WIDTH_TRANSITION_MS + 50);
    return () => {
      cancelled = true;
      if (gutterScrollTimeoutRef.current != null) {
        clearTimeout(gutterScrollTimeoutRef.current);
        gutterScrollTimeoutRef.current = null;
      }
      for (const id of timeouts) clearTimeout(id);
    };
  }, [
    suggestionsFocus,
    clearSuggestionsFocus,
    jumpToSection,
    comments,
    requestCommentFocus,
    sidebarCollapsed,
    viewingDocument,
  ]);

  const jumpToComment = useCallback(
    (id: string) => {
      const root = comments.find((c) => c.id === id && !c.parentId);
      if (!root) return;

      // Set focus state first — this also tells the margin-gutter which card
      // is active (it will skip its own scroll because we pass skipAutoScroll).
      requestCommentFocus(id);

      const scrollToCard = () => {
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
      };

      const gutterAlreadyVisible = isReviewGutterVisible(
        sidebarCollapsed,
        viewingDocument
      );
      setSidebarCollapsed(true);
      if (gutterScrollTimeoutRef.current != null) {
        clearTimeout(gutterScrollTimeoutRef.current);
        gutterScrollTimeoutRef.current = null;
      }
      if (gutterAlreadyVisible) {
        scrollToCard();
        return;
      }
      // Wait for the assistant to collapse and the gutter to mount/measure.
      gutterScrollTimeoutRef.current = setTimeout(() => {
        gutterScrollTimeoutRef.current = null;
        scrollToCard();
      }, WORKSPACE_PANEL_WIDTH_TRANSITION_MS + 50);
    },
    [comments, jumpToSection, requestCommentFocus, sidebarCollapsed, viewingDocument]
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
      <RequestExpertReviewDialog
        open={expertReviewOpen}
        onOpenChange={setExpertReviewOpen}
        reportId={report.id}
        documentNo={report.documentNo}
      />
      <ReportWorkspaceHeader
        report={report}
        mode={mode}
        authorName={author?.name}
        managerNames={managerNames}
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
        showExpertReview={showExpertReview}
        onExpertReview={() => setExpertReviewOpen(true)}
        chrome={chrome}
        onChromeChange={setChrome}
        workProductView={workProductView}
      />

      {analyticsSurface || viewingDocument ? null : <ReportEditorToolbar />}

      <div
        ref={containerRef}
        className={cn(
          "relative flex min-h-0 flex-1 overflow-hidden",
          isResizing && "select-none"
        )}
      >
        <div
          className={cn(
            "relative z-10 order-1 h-full shrink-0",
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
          data-testid="report-work-product"
          className={cn(
            "@container flex min-h-0 flex-col bg-[var(--background)]",
            agentChrome
              ? "order-3 shrink-0"
              : "order-2 min-w-0 flex-1",
            !agentChrome &&
              !(analyticsSurface || viewingDocument) &&
              continuousDocument &&
              "bg-[var(--muted)]"
          )}
          style={agentChrome ? { width: previewWidth } : undefined}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            {statsEnabled ? (
              <WorkProductTabs
                value={workProductView}
                onChange={(next) => {
                  if (next === "analytics") {
                    setCompare(null);
                    setAnalyticsOpen(true);
                    setSidebarTab("assistant");
                  }
                  setWorkProductView(next);
                }}
              />
            ) : null}
            <DocumentRevisionHistory
              reportId={report.id}
              compare={compare}
              onCompare={(range) => {
                setWorkProductView("report");
                setCompare(range);
              }}
              onExitCompare={() => setCompare(null)}
            />
          </div>
          <div
            className={cn(
              "relative flex min-h-0 min-w-0 flex-1 flex-col",
              hideReportEditors ? "overflow-hidden" : "overflow-auto"
            )}
          >
            {comparing ? (
              <DocumentRevisionDiff
                reportId={report.id}
                from={compare.from}
                to={compare.to}
                onExit={() => setCompare(null)}
              />
            ) : null}
            <div
              hidden={hideReportEditors}
              inert={hideReportEditors}
              className={cn(
                "mx-auto grid w-full min-w-0 grid-cols-1 gap-8 pb-24",
                hideReportEditors && "hidden",
                continuousDocument
                  ? "max-w-none px-4 py-6"
                  : "max-w-[1180px] px-6 py-8",
                showReviewGutter && REVIEW_GUTTER_GRID_COLS
              )}
            >
              <div
                className={cn(
                  "space-y-10 min-w-0",
                  documentType === "quality_risk_assessment" && "qra-document"
                )}
              >
                <ReportHeader />
                <div
                  className={cn(
                    "min-w-0",
                    continuousDocument ? "space-y-4" : "space-y-10"
                  )}
                >
                  {getWorkspaceSections(report.documentType).map((section) => {
                    const s = section.key;
                    const Editor =
                      SECTION_EDITORS_BY_DOCUMENT_TYPE[report.documentType]?.[
                        s
                      ];
                    if (!Editor) return null;
                    const extra = showReviewGutter
                      ? sectionMinHeights[s]
                      : undefined;
                    return (
                      <section
                        key={s}
                        id={s}
                        style={
                          extra ? { paddingBottom: `${extra}px` } : undefined
                        }
                      >
                        <Editor />
                      </section>
                    );
                  })}
                </div>
              </div>
              {showReviewGutter ? (
                <aside
                  className="relative hidden min-w-0 @[800px]:block"
                  aria-label="Review margin"
                >
                  <MarginGutter
                    onSectionOverflow={handleSectionOverflow}
                  />
                </aside>
              ) : null}
            </div>
            {analyticsOpen ? (
              <div
                hidden={!analyticsSurface || viewingDocument || comparing}
                inert={!analyticsSurface || viewingDocument || comparing}
                className={cn(
                  "min-h-0 flex-1",
                  (!analyticsSurface || viewingDocument || comparing) && "hidden"
                )}
              >
                <StatisticalWorkspace
                  reportId={report.id}
                  readOnly={!analyticsCanEdit}
                  reloadEpoch={analyticsReloadEpoch}
                  agentBusy={analyticsAgentBusy}
                />
              </div>
            ) : null}
            {viewingDocument && !comparing ? <AttachmentCanvas /> : null}
          </div>
          {agentChrome ? (
            <WorkspaceResizeHandle
              label="Resize document panel"
              controlsId="report-work-product"
              edge="start"
              value={previewWidth}
              min={previewBounds.min}
              max={previewBounds.max}
              onChange={setPreviewWidth}
              onDragStart={() => beginResize("preview")}
              onDragEnd={endResize}
              onReset={resetPreviewWidth}
            />
          ) : null}
        </main>

        <div
          className={cn(
            "relative z-10 h-full",
            agentChrome
              ? "order-2 min-w-0 flex-1"
              : "order-3 shrink-0",
            !agentChrome &&
              !isResizing &&
              "transition-[width] duration-200 ease-in-out"
          )}
          style={agentChrome ? undefined : { width: chatWidth }}
        >
          <div
            className={cn(
              "h-full w-full",
              agentChrome && "mx-auto max-w-[800px]"
            )}
          >
            <ReportSidebar
              collapsed={agentChrome ? false : sidebarCollapsed}
              onToggleCollapse={toggleSidebarCollapse}
              hideCollapse={agentChrome}
              chrome={chrome}
              activeTab={sidebarTab}
              onTabChange={setSidebarTab}
              onJumpToSection={jumpToSection}
              onJumpToPlaceholder={handleJumpToPlaceholder}
              onJumpToComment={jumpToComment}
              initialCriteriaSection={criteriaFocusSection}
              workProductView={workProductView}
              analyticsOpen={analyticsOpen}
              onAnalyticsSettled={() =>
                setAnalyticsReloadEpoch((epoch) => epoch + 1)
              }
              onAnalyticsAgentBusy={setAnalyticsAgentBusy}
            />
          </div>
          {agentChrome || sidebarCollapsed ? null : (
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

function AttachmentCanvas() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AttachmentViewer />
    </div>
  );
}
