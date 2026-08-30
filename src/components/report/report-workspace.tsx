"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ComponentType,
} from "react";
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
import {
  agentChatTargetOnEnter,
  shouldCollapseAssistantOnSuggestionFocus,
  shouldRevealCriteriaTab,
  type WorkspaceChrome,
  type WorkProductView,
} from "./workspace-chrome";
import {
  DEFAULT_WORKSPACE_CHROME,
  readWorkspaceChrome,
  subscribeWorkspaceChromePrefs,
  writeWorkspaceChrome,
} from "./workspace-chrome-prefs";
import { WorkProductTabs } from "./work-product-tabs";
import { CommentsGutterToggle } from "./comments-gutter-toggle";
import { DocumentRevisionHistory } from "./document-revision-history";
import { DocumentRevisionDiff } from "./document-revision-diff";
import { AnalyticsRevisionDiff } from "./analytics-revision-diff";
import { ReportEditorToolbar } from "./report-editor-toolbar";
import {
  attachmentIdFromTab,
  attachmentTabId,
  buildCanvasTabs,
  canvasTabKind,
  ensureAttachmentOpen,
  pruneOpenAttachments,
  removeAttachmentOpen,
  tabIdAfterClose,
  type CanvasTabId,
} from "./work-product-canvas";
import { MarginGutter } from "./review-rail/margin-gutter";
import { ReportSidebar, type SidebarTab } from "./report-sidebar";
import { DocumentsPanel } from "./documents/documents-panel";
import { AttachmentViewer } from "./attachment-viewer";
import { StatisticalWorkspace, type AnalyticsFocusApi } from "@/components/statistical-analysis/workspace";
import type { AnalyticsMentionSheet } from "@/lib/statistical-analysis/mentions";
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
import {
  readChatComposerPrefs,
  writeChatComposerPrefs,
} from "@/lib/ai/chat/composer-prefs";
import { cn } from "@/lib/utils";
import { PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceLayout } from "@/hooks/use-workspace-layout";
import { AgentWorkProductRail } from "./agent-work-product-rail";
import { WorkspaceResizeHandle } from "./workspace-resize-handle";
import {
  COLLAPSED_RAIL_PX,
  documentCanvasWidthClass,
  documentColumnStyle,
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
  const { suggestionsFocus, clearSuggestionsFocus, isEvaluating } =
    useReportEvaluations();
  const { activeAttachmentId, attachments, openDocument, closeDocument, documentOpenEpoch } =
    useReportAttachments();
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
  const [previewCollapsed, setPreviewCollapsed] = useState(true);
  const chrome = useSyncExternalStore(
    subscribeWorkspaceChromePrefs,
    () => readWorkspaceChrome(currentUserId, report.id),
    () => DEFAULT_WORKSPACE_CHROME
  );
  const [workProductView, setWorkProductView] =
    useState<WorkProductView>("report");
  const [activeTabId, setActiveTabId] = useState<CanvasTabId>("report");
  const [openAttachmentIds, setOpenAttachmentIds] = useState<string[]>([]);
  const [seenOpenEpoch, setSeenOpenEpoch] = useState(-1);
  const [compare, setCompare] = useState<{
    from: number;
    to: number;
    surface: "report" | "analytics";
  } | null>(null);
  const agentChrome = chrome === "agent";
  const [commentsGutterVisible, setCommentsGutterVisible] = useState(false);
  const {
    containerRef,
    isResizing,
    chatWidth,
    docsWidth,
    previewWidth,
    documentWidth,
    chatBounds,
    docsBounds,
    previewBounds,
    documentBounds,
    setChatWidth,
    setDocsWidth,
    setPreviewWidth,
    setDocumentWidth,
    resetChatWidth,
    resetDocsWidth,
    resetPreviewWidth,
    resetDocumentWidth,
    beginResize,
    endResize,
  } = useWorkspaceLayout({
    reportId: report.id,
    chrome,
    chatCollapsed: agentChrome ? false : sidebarCollapsed,
    docsCollapsed: documentsCollapsed,
    previewCollapsed: agentChrome && previewCollapsed,
  });
  const showCollapsedWorkProduct =
    agentChrome && previewCollapsed && !isResizing;
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("assistant");
  const wasEvaluatingRef = useRef(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsReloadEpoch, setAnalyticsReloadEpoch] = useState(0);
  const [analyticsAgentBusy, setAnalyticsAgentBusy] = useState(false);
  const [analyticsMentionSheets, setAnalyticsMentionSheets] = useState<
    AnalyticsMentionSheet[]
  >([]);
  const analyticsFocusRef = useRef<AnalyticsFocusApi | null>(null);
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
  const liveAttachmentIds = new Set(attachments.map((item) => item.id));
  if (documentOpenEpoch !== seenOpenEpoch) {
    setSeenOpenEpoch(documentOpenEpoch);
    if (activeAttachmentId) {
      setOpenAttachmentIds((ids) =>
        ensureAttachmentOpen(ids, activeAttachmentId)
      );
      setActiveTabId(attachmentTabId(activeAttachmentId));
      if (agentChrome) {
        setPreviewCollapsed(false);
      }
    }
  }
  const liveOpenAttachmentIds = pruneOpenAttachments(
    documentOpenEpoch !== seenOpenEpoch && activeAttachmentId
      ? ensureAttachmentOpen(openAttachmentIds, activeAttachmentId)
      : openAttachmentIds,
    liveAttachmentIds
  );
  const liveActiveTabId = ((): CanvasTabId => {
    if (documentOpenEpoch !== seenOpenEpoch && activeAttachmentId) {
      return attachmentTabId(activeAttachmentId);
    }
    if (activeTabId === "history" && !compare) return "report";
    if (activeTabId === "analytics" && !statsEnabled) return "report";
    const id = attachmentIdFromTab(activeTabId);
    if (id && !liveAttachmentIds.has(id)) return "report";
    return activeTabId;
  })();
  const reportSurface = liveActiveTabId === "report";
  const analyticsSurface = liveActiveTabId === "analytics";
  const comparing = liveActiveTabId === "history" && compare != null;
  const viewingDocument = canvasTabKind(liveActiveTabId) === "attachment";
  const hideReportEditors = !reportSurface;
  const analyticsCanEdit = canSaveReportSection(
    { id: currentUserId, role: currentUserRole, email: currentUserEmail },
    report
  );
  const attachmentLabels = Object.fromEntries(
    attachments.map((item) => [item.id, item.filename])
  );
  const canvasTabs = buildCanvasTabs({
    statsEnabled,
    openAttachmentIds: liveOpenAttachmentIds,
    attachmentLabels,
    compare,
  });
  const showCommentsSwitch =
    !agentChrome && reportSurface && mode !== "view";
  const historySurface: "report" | "analytics" =
    comparing && compare
      ? compare.surface
      : analyticsSurface
        ? "analytics"
        : "report";
  const showHistory = reportSurface || analyticsSurface || comparing;
  const activeAttachmentTabId = attachmentIdFromTab(liveActiveTabId);
  const activeAttachmentTabLabel = activeAttachmentTabId
    ? attachmentLabels[activeAttachmentTabId]
    : undefined;
  const handleAnalyticsMentionSheetsChange = useCallback(
    (sheets: AnalyticsMentionSheet[]) => {
      setAnalyticsMentionSheets(sheets);
    },
    []
  );

  useEffect(() => {
    const justFinished = shouldRevealCriteriaTab({
      wasEvaluating: wasEvaluatingRef.current,
      isEvaluating,
      chrome,
      workProductView,
    });
    wasEvaluatingRef.current = isEvaluating;
    if (justFinished) {
      setSidebarTab("criteria");
    }
  }, [chrome, isEvaluating, workProductView]);

  const showReviewGutter =
    reportSurface &&
    isReviewGutterVisible(commentsGutterVisible, false);
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

  const jumpToSection = useCallback((s: SectionType) => {
    setWorkProductView("report");
    setActiveTabId("report");
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
      // Leave the assistant as the engineer left it. Collapsing it after
      // Suggest fixes or a document-chrome chat proposal hid the thread as
      // soon as the edit landed. Review margin stays opt-in via the Comments
      // switch; inline suggestion marks remain in the document.
      if (shouldCollapseAssistantOnSuggestionFocus()) {
        setSidebarCollapsed(true);
      }
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
  }, [
    suggestionsFocus,
    clearSuggestionsFocus,
    jumpToSection,
    comments,
    requestCommentFocus,
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
        commentsGutterVisible,
        false
      );
      setWorkProductView("report");
      setActiveTabId("report");
      setCommentsGutterVisible(true);
      if (gutterScrollTimeoutRef.current != null) {
        clearTimeout(gutterScrollTimeoutRef.current);
        gutterScrollTimeoutRef.current = null;
      }
      if (gutterAlreadyVisible) {
        scrollToCard();
        return;
      }
      // Wait for the gutter to mount/measure.
      gutterScrollTimeoutRef.current = setTimeout(() => {
        gutterScrollTimeoutRef.current = null;
        scrollToCard();
      }, WORKSPACE_PANEL_WIDTH_TRANSITION_MS + 50);
    },
    [comments, jumpToSection, requestCommentFocus, commentsGutterVisible]
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

  const selectWorkProductView = useCallback(
    (next: WorkProductView) => {
      if (agentChrome && previewCollapsed) {
        setPreviewCollapsed(false);
      }
      if (next === "analytics") {
        setAnalyticsOpen(true);
        setSidebarTab("assistant");
      }
      setWorkProductView(next);
      setActiveTabId(next);
    },
    [agentChrome, previewCollapsed]
  );

  const selectCanvasTab = useCallback(
    (id: CanvasTabId) => {
      if (agentChrome && previewCollapsed) {
        setPreviewCollapsed(false);
      }
      const kind = canvasTabKind(id);
      switch (kind) {
        case "report":
        case "analytics":
          if (kind === "analytics") {
            setAnalyticsOpen(true);
            setSidebarTab("assistant");
          }
          setWorkProductView(kind);
          setActiveTabId(kind);
          return;
        case "history":
          setActiveTabId("history");
          return;
        case "attachment": {
          const attachmentId = attachmentIdFromTab(id);
          if (attachmentId) openDocument(attachmentId);
          return;
        }
        default: {
          const _exhaustive: never = kind;
          return _exhaustive;
        }
      }
    },
    [agentChrome, openDocument, previewCollapsed]
  );

  const closeCanvasTab = useCallback(
    (id: CanvasTabId) => {
      const kind = canvasTabKind(id);
      switch (kind) {
        case "report":
        case "analytics":
          return;
        case "history": {
          const surface = compare?.surface ?? "report";
          setCompare(null);
          if (surface === "analytics") {
            setAnalyticsOpen(true);
            setSidebarTab("assistant");
          }
          setActiveTabId(surface);
          setWorkProductView(surface);
          return;
        }
        case "attachment": {
          const attachmentId = attachmentIdFromTab(id);
          if (!attachmentId) return;
          const nextActive = tabIdAfterClose(canvasTabs, id, liveActiveTabId);
          setOpenAttachmentIds((ids) =>
            removeAttachmentOpen(ids, attachmentId)
          );
          const nextKind = canvasTabKind(nextActive);
          switch (nextKind) {
            case "report":
            case "analytics":
              if (nextKind === "analytics") {
                setAnalyticsOpen(true);
                setSidebarTab("assistant");
              }
              setWorkProductView(nextKind);
              setActiveTabId(nextKind);
              break;
            case "history":
              setActiveTabId("history");
              break;
            case "attachment": {
              const nextAttachment = attachmentIdFromTab(nextActive);
              if (nextAttachment) openDocument(nextAttachment);
              break;
            }
            default: {
              const _exhaustive: never = nextKind;
              return _exhaustive;
            }
          }
          if (nextKind !== "attachment" && activeAttachmentId === attachmentId) {
            closeDocument();
          }
          return;
        }
        default: {
          const _exhaustive: never = kind;
          return _exhaustive;
        }
      }
    },
    [activeAttachmentId, liveActiveTabId, canvasTabs, closeDocument, openDocument, compare]
  );

  const handleChromeChange = useCallback(
    (next: WorkspaceChrome) => {
      if (next === "agent") {
        setCommentsGutterVisible(false);
        if (currentUserId) {
          const stored = readChatComposerPrefs(currentUserId, report.id);
          writeChatComposerPrefs(currentUserId, report.id, {
            mode: stored.mode,
            pace: stored.pace,
            chatTarget: agentChatTargetOnEnter({
              workProductView,
              statsEnabled,
            }),
          });
        }
        if (workProductView === "analytics") {
          setAnalyticsOpen(true);
        }
      }
      writeWorkspaceChrome(currentUserId, report.id, next);
    },
    [currentUserId, report.id, statsEnabled, workProductView]
  );

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
        onChromeChange={handleChromeChange}
        workProductView={workProductView}
      />

      {reportSurface ? <ReportEditorToolbar /> : null}

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
            documentType={report.documentType}
            onJumpToSection={jumpToSection}
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
            // `relative` is required so the document-panel resize handle
            // (`absolute -left-1.5`) anchors to this column, not the workspace.
            // Do not add z-10 here: the handle's z-20 must paint above chat.
            "@container relative flex min-h-0 flex-col bg-[var(--background)]",
            agentChrome
              ? "order-3 shrink-0 border-l border-[var(--border)]"
              : "order-2 min-w-0 flex-1",
            agentChrome &&
              !isResizing &&
              "transition-[width] duration-200 ease-in-out"
          )}
          style={agentChrome ? { width: previewWidth } : undefined}
        >
          {showCollapsedWorkProduct ? (
            <AgentWorkProductRail
              activeTabId={liveActiveTabId}
              statsEnabled={statsEnabled}
              attachmentLabel={activeAttachmentTabLabel}
              onSelectView={selectWorkProductView}
              onExpand={() => setPreviewCollapsed(false)}
            />
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
                <WorkProductTabs
                  tabs={canvasTabs}
                  value={liveActiveTabId}
                  onChange={selectCanvasTab}
                  onClose={closeCanvasTab}
                />
                <div className="ml-auto flex shrink-0 items-center gap-2 py-2">
                  {showHistory ? (
                    <DocumentRevisionHistory
                      reportId={report.id}
                      surface={historySurface}
                      compare={compare}
                      onCompare={(range) => {
                        if (agentChrome && previewCollapsed) {
                          setPreviewCollapsed(false);
                        }
                        if (historySurface === "analytics") {
                          setAnalyticsOpen(true);
                        }
                        setWorkProductView(historySurface);
                        setCompare({ ...range, surface: historySurface });
                        setActiveTabId("history");
                      }}
                      onExitCompare={() => {
                        const surface = compare?.surface ?? "report";
                        setCompare(null);
                        if (surface === "analytics") {
                          setAnalyticsOpen(true);
                        }
                        setActiveTabId(surface);
                        setWorkProductView(surface);
                      }}
                    />
                  ) : null}
                  {showCommentsSwitch ? (
                    <CommentsGutterToggle
                      checked={commentsGutterVisible}
                      onCheckedChange={setCommentsGutterVisible}
                    />
                  ) : null}
                  {agentChrome ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label="Collapse document panel"
                      aria-expanded
                      title="Collapse"
                      onClick={() => setPreviewCollapsed(true)}
                    >
                      <PanelRightClose className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <div
                className={cn(
                  "relative flex min-h-0 min-w-0 flex-1 flex-col",
                  hideReportEditors ? "overflow-hidden" : "overflow-auto",
                  reportSurface && "bg-[var(--muted)]"
                )}
              >
                {comparing && compare?.surface === "report" ? (
                  <DocumentRevisionDiff
                    reportId={report.id}
                    from={compare.from}
                    to={compare.to}
                    onExit={() => {
                      setCompare(null);
                      setActiveTabId("report");
                      setWorkProductView("report");
                    }}
                  />
                ) : null}
                {comparing && compare?.surface === "analytics" ? (
                  <AnalyticsRevisionDiff
                    reportId={report.id}
                    from={compare.from}
                    to={compare.to}
                    onExit={() => {
                      setCompare(null);
                      setAnalyticsOpen(true);
                      setActiveTabId("analytics");
                      setWorkProductView("analytics");
                    }}
                  />
                ) : null}
                <div
                  hidden={hideReportEditors}
                  inert={hideReportEditors}
                  data-testid="report-document-canvas"
                  className={cn(
                    "mx-auto grid w-full min-w-0 grid-cols-1 gap-8 pb-24",
                    hideReportEditors && "hidden",
                    documentCanvasWidthClass({
                      continuousDocument,
                      reviewGutterVisible: showReviewGutter,
                    }),
                    showReviewGutter && REVIEW_GUTTER_GRID_COLS
                  )}
                  style={
                    continuousDocument
                      ? undefined
                      : documentColumnStyle(documentWidth)
                  }
                >
                  <div
                    id="report-document-sheet"
                    className={cn(
                      "relative space-y-10 min-w-0",
                      documentType === "quality_risk_assessment" && "qra-document"
                    )}
                  >
                    {continuousDocument ? null : (
                      <>
                        <WorkspaceResizeHandle
                          label="Resize document from the left"
                          controlsId="report-document-sheet"
                          edge="start"
                          value={documentWidth}
                          min={documentBounds.min}
                          max={documentBounds.max}
                          onChange={setDocumentWidth}
                          onDragStart={() => beginResize("document")}
                          onDragEnd={endResize}
                          onReset={resetDocumentWidth}
                        />
                        <WorkspaceResizeHandle
                          label="Resize document from the right"
                          controlsId="report-document-sheet"
                          edge="end"
                          value={documentWidth}
                          min={documentBounds.min}
                          max={documentBounds.max}
                          onChange={setDocumentWidth}
                          onDragStart={() => beginResize("document")}
                          onDragEnd={endResize}
                          onReset={resetDocumentWidth}
                        />
                      </>
                    )}
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
                    hidden={!analyticsSurface}
                    inert={!analyticsSurface}
                    className={cn(
                      "min-h-0 flex-1",
                      !analyticsSurface && "hidden"
                    )}
                  >
                    <StatisticalWorkspace
                      reportId={report.id}
                      readOnly={!analyticsCanEdit}
                      reloadEpoch={analyticsReloadEpoch}
                      agentBusy={analyticsAgentBusy}
                      focusApiRef={analyticsFocusRef}
                      onMentionSheetsChange={handleAnalyticsMentionSheetsChange}
                    />
                  </div>
                ) : null}
                {viewingDocument ? (
                  <AttachmentCanvas
                    onClose={() => {
                      const attachmentId = attachmentIdFromTab(liveActiveTabId);
                      if (attachmentId) {
                        setOpenAttachmentIds((ids) =>
                          removeAttachmentOpen(ids, attachmentId)
                        );
                      }
                      selectWorkProductView("report");
                      closeDocument();
                    }}
                  />
                ) : null}
              </div>
            </>
          )}
          {agentChrome ? (
            <WorkspaceResizeHandle
              label="Resize document panel"
              controlsId="report-work-product"
              edge="start"
              value={previewWidth}
              min={
                showCollapsedWorkProduct ? COLLAPSED_RAIL_PX : previewBounds.min
              }
              max={previewBounds.max}
              onChange={setPreviewWidth}
              onDragStart={() => {
                setPreviewCollapsed(false);
                beginResize("preview");
              }}
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
              statsEnabled={statsEnabled}
              onAnalyticsSettled={() =>
                setAnalyticsReloadEpoch((epoch) => epoch + 1)
              }
              onAnalyticsAgentBusy={setAnalyticsAgentBusy}
              onAnalyticsFocusSheet={(sheetId) =>
                analyticsFocusRef.current?.focusSheet(sheetId)
              }
              onAnalyticsFocusAnalysis={(analysisId) =>
                analyticsFocusRef.current?.focusAnalysis(analysisId)
              }
              analyticsReloadEpoch={analyticsReloadEpoch}
              analyticsMentionSheets={analyticsMentionSheets}
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

function AttachmentCanvas({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AttachmentViewer onClose={onClose} />
    </div>
  );
}
