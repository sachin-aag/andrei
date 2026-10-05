"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { startPostHogSessionRecording } from "@/providers/posthog-provider";
import {
  useReportComments,
  useReportData,
  useReportEditors,
  useReportEvaluations,
  useReportPlaceholders,
} from "@/providers/report-provider";
import { useReportAttachments } from "@/providers/report-attachments-provider";
import {
  LazyWorkspaceSection,
  notifyWorkspaceScroll,
  requestWorkspaceSectionMount,
  setLazyWorkspaceBackgroundMounts,
  warmupAllLazyWorkspaceSections,
} from "./lazy-workspace-section";
import { ReportWorkspaceHeader } from "./report-workspace-header";
import { ReportWorkspaceLoading } from "./report-workspace-loading";
import {
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
import {
  attachmentIdFromTab,
  attachmentTabId,
  buildCanvasTabs,
  canvasTabKind,
  ensureAttachmentOpen,
  pruneOpenAttachments,
  rememberCanvasTabVisit,
  removeAttachmentOpen,
  tabIdAfterClosing,
  type CanvasTabId,
} from "./work-product-canvas";
import { ReviewGutterPaintedProvider } from "./review-gutter-painted";
import { isReviewGutterColumnPainted } from "./show-document-suggestion-card";
import type { SidebarTab } from "./report-sidebar";
import { CanvasTabPane } from "./canvas-tab-pane";
import { CanvasTabScrollProvider } from "./canvas-tab-scroll";
import type { AnalyticsFocusApi } from "@/components/statistical-analysis/workspace";
import type { AnalyticsMentionSheet } from "@/lib/statistical-analysis/mentions";
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
  REVIEW_GUTTER_ASIDE_CLASS,
  REVIEW_GUTTER_GRID_COLS,
  WORKSPACE_PANEL_WIDTH_TRANSITION_MS,
} from "./workspace-layout";
import type { SignatureMeaningUi } from "./electronic-signature-dialog";
import { useDocumentSectionEditors } from "./section-editor-loaders";
import { emitWorkspaceLoadStage } from "@/lib/workspace-load-telemetry-client";

emitWorkspaceLoadStage("workspace_module");

const ReportHeader = dynamic(
  () => import("./report-header").then((mod) => mod.ReportHeader),
  { ssr: false }
);

const ReportEditorToolbar = dynamic(
  () =>
    import("./report-editor-toolbar").then((mod) => mod.ReportEditorToolbar),
  { ssr: false }
);

const MarginGutter = dynamic(
  () => import("./review-rail/margin-gutter").then((mod) => mod.MarginGutter),
  { ssr: false }
);

const ElectronicSignatureDialog = dynamic(
  () =>
    import("./electronic-signature-dialog").then(
      (mod) => mod.ElectronicSignatureDialog
    ),
  { ssr: false }
);

const ReportDetailsEditDialog = dynamic(
  () =>
    import("./report-details-edit-dialog").then(
      (mod) => mod.ReportDetailsEditDialog
    ),
  { ssr: false }
);

const RequestExpertReviewDialog = dynamic(
  () =>
    import("./request-expert-review-dialog").then(
      (mod) => mod.RequestExpertReviewDialog
    ),
  { ssr: false }
);

const DocumentRevisionHistory = dynamic(
  () =>
    import("./document-revision-history").then(
      (mod) => mod.DocumentRevisionHistory
    ),
  { ssr: false }
);

const DocumentRevisionDiff = dynamic(
  () =>
    import("./document-revision-diff").then((mod) => mod.DocumentRevisionDiff),
  { ssr: false }
);

const AnalyticsRevisionDiff = dynamic(
  () =>
    import("./analytics-revision-diff").then(
      (mod) => mod.AnalyticsRevisionDiff
    ),
  { ssr: false }
);

const DocumentsPanel = dynamic(
  () =>
    import("./documents/documents-panel").then((mod) => mod.DocumentsPanel),
  { ssr: false, loading: () => <div className="h-full" /> }
);

const ReportSidebar = dynamic(
  () => import("./report-sidebar").then((mod) => mod.ReportSidebar),
  { ssr: false, loading: () => <div className="h-full" /> }
);

const AttachmentCanvasStack = dynamic(
  () =>
    import("./attachment-canvas-stack").then(
      (mod) => mod.AttachmentCanvasStack
    ),
  { ssr: false }
);

const StatisticalWorkspace = dynamic(
  () =>
    import("@/components/statistical-analysis/workspace").then(
      (mod) => mod.StatisticalWorkspace
    ),
  { ssr: false }
);

function loadWorkspaceShell() {
  return Promise.all([
    import("./documents/documents-panel"),
    import("./report-sidebar"),
    import("./chat-panel"),
    import("./attachment-canvas-stack"),
  ]);
}

const EDITORS_AFTER_SHELL_MS = 1000;

export type { WorkspaceMode };

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
  const sectionEditors = useDocumentSectionEditors(report.documentType);
  const { pendingPlaceholders } = useReportPlaceholders();

  useEffect(() => {
    emitWorkspaceLoadStage("workspace_mounted");
  }, []);

  const [editorsAllowed, setEditorsAllowed] = useState(false);
  const didWarmupEditors = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    void loadWorkspaceShell().then(() => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setEditorsAllowed(true);
        setLazyWorkspaceBackgroundMounts(true);
      }, EDITORS_AFTER_SHELL_MS);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setLazyWorkspaceBackgroundMounts(false);
    };
  }, []);

  const handleSectionMounted = useCallback((section: string) => {
    emitWorkspaceLoadStage("section_mounted", { section });
    emitWorkspaceLoadStage("first_editor_ready", { section });
    if (didWarmupEditors.current) return;
    didWarmupEditors.current = true;
    warmupAllLazyWorkspaceSections();
  }, []);
  const { getEditor } = useReportEditors();
  const { requestCommentFocus, comments } = useReportComments();
  const { suggestionsFocus, clearSuggestionsFocus, isEvaluating } =
    useReportEvaluations();
  const {
    activeAttachmentId,
    attachments,
    openDocument,
    closeDocument,
    forgetDocumentPreview,
    documentOpenEpoch,
  } = useReportAttachments();
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
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
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
  const [canvasTabRecents, setCanvasTabRecents] = useState<CanvasTabId[]>([
    "report",
  ]);
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
  const reviewGutterAsideRef = useRef<HTMLElement>(null);
  const [reviewGutterColumnMeasured, setReviewGutterColumnMeasured] =
    useState(false);
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
  if (canvasTabRecents[canvasTabRecents.length - 1] !== liveActiveTabId) {
    setCanvasTabRecents((recents) =>
      rememberCanvasTabVisit(recents, liveActiveTabId)
    );
  }
  const reportSurface = liveActiveTabId === "report";
  const analyticsSurface = liveActiveTabId === "analytics";
  const comparing = liveActiveTabId === "history" && compare != null;
  const viewingDocument = canvasTabKind(liveActiveTabId) === "attachment";
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
    startPostHogSessionRecording();
  }, []);

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
  const reviewGutterColumnPainted =
    showReviewGutter && reviewGutterColumnMeasured;

  useLayoutEffect(() => {
    if (!showReviewGutter) {
      return;
    }
    const el = reviewGutterAsideRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      setReviewGutterColumnMeasured(isReviewGutterColumnPainted(el));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    const main = mainRef.current;
    if (main) observer.observe(main);
    return () => observer.disconnect();
  }, [showReviewGutter]);

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

  const jumpEpochRef = useRef(0);
  const pendingJumpRef = useRef<SectionType | null>(null);
  const jumpToSection = useCallback((s: SectionType) => {
    setWorkProductView("report");
    setActiveTabId("report");
    const epoch = ++jumpEpochRef.current;
    if (!editorsAllowed) {
      pendingJumpRef.current = s;
      setEditorsAllowed(true);
      setLazyWorkspaceBackgroundMounts(true);
    }
    return requestWorkspaceSectionMount(s).then(() => {
      if (jumpEpochRef.current !== epoch) return;
      const el = mainRef.current?.querySelector(`#${s}`);
      if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, [editorsAllowed]);

  useEffect(() => {
    const s = pendingJumpRef.current;
    if (!editorsAllowed || !s) return;
    pendingJumpRef.current = null;
    void requestWorkspaceSectionMount(s);
  }, [editorsAllowed]);

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
    requestWorkspaceSectionMount(section);
    // Wait for the urgent lazy mount (one frame) plus TipTap create.
    const retryDelaysMs = [0, 50, 100, 200, 400, 800];

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
    void jumpToSection(p.section).then(() => {
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

  // Header Close and the tab-strip X both restore the last canvas tab.
  const closeAttachmentTab = useCallback(
    (attachmentId: string) => {
      forgetDocumentPreview(attachmentId);
      const remainingIds = removeAttachmentOpen(
        liveOpenAttachmentIds,
        attachmentId
      );
      setOpenAttachmentIds(remainingIds);

      const closedTabId = attachmentTabId(attachmentId);
      const remainingTabIds = buildCanvasTabs({
        statsEnabled,
        openAttachmentIds: remainingIds,
        attachmentLabels,
        compare,
      }).map((tab) => tab.id);

      const next = tabIdAfterClosing({
        closedId: closedTabId,
        currentlyActive: liveActiveTabId,
        recents: canvasTabRecents,
        remainingTabIds,
      });
      setCanvasTabRecents((recents) =>
        recents.filter((id) => id !== closedTabId)
      );

      if (
        activeAttachmentId === attachmentId &&
        canvasTabKind(next) !== "attachment"
      ) {
        closeDocument();
      }
      if (next !== liveActiveTabId) {
        selectCanvasTab(next);
      }
    },
    [
      activeAttachmentId,
      attachmentLabels,
      canvasTabRecents,
      closeDocument,
      compare,
      forgetDocumentPreview,
      liveActiveTabId,
      liveOpenAttachmentIds,
      selectCanvasTab,
      statsEnabled,
    ]
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
          closeAttachmentTab(attachmentId);
          return;
        }
        default: {
          const _exhaustive: never = kind;
          return _exhaustive;
        }
      }
    },
    [closeAttachmentTab, compare]
  );

  const handleChromeChange = useCallback(
    (next: WorkspaceChrome) => {
      if (next === "agent") {
        setCommentsGutterVisible(false);
        if (workProductView === "analytics") {
          setAnalyticsOpen(true);
        }
      }
      writeWorkspaceChrome(currentUserId, report.id, next);
    },
    [currentUserId, report.id, workProductView]
  );

  return (
    <CanvasTabScrollProvider userId={currentUserId} reportId={report.id}>
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
          data-walkthrough="report-editor"
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
              "transition-[width] duration-200 ease-in-out",
            !agentChrome &&
              reportSurface &&
              continuousDocument &&
              "bg-[var(--muted)]"
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
                </div>
              </div>
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                {compare ? (
                  <CanvasTabPane
                    active={comparing}
                    scrollable
                    scrollTabId="history"
                    testId="work-product-history-canvas"
                  >
                    {compare.surface === "report" ? (
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
                    ) : (
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
                    )}
                  </CanvasTabPane>
                ) : null}
                <CanvasTabPane
                  active={reportSurface}
                  scrollable
                  scrollTabId="report"
                  testId="report-document-canvas"
                  onScroll={notifyWorkspaceScroll}
                >
                <ReviewGutterPaintedProvider painted={reviewGutterColumnPainted}>
                <div
                  className={cn(
                    "mx-auto grid w-full min-w-0 grid-cols-1 gap-8 pb-24",
                    documentCanvasWidthClass({
                      continuousDocument,
                      reviewGutterVisible: showReviewGutter,
                    }),
                    showReviewGutter && "review-gutter-open",
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
                    {editorsAllowed ? (
                      getWorkspaceSections(report.documentType).map(
                        (section, index) => {
                          const s = section.key;
                          const Editor = sectionEditors?.[s];
                          if (!Editor) return null;
                          const extra = showReviewGutter
                            ? sectionMinHeights[s]
                            : undefined;
                          return (
                            <LazyWorkspaceSection
                              key={s}
                              id={s}
                              title={section.label}
                              eager={index < 1}
                              onMounted={handleSectionMounted}
                              style={
                                extra
                                  ? { paddingBottom: `${extra}px` }
                                  : undefined
                              }
                            >
                              <Editor />
                            </LazyWorkspaceSection>
                          );
                        }
                      )
                    ) : (
                      <ReportWorkspaceLoading />
                    )}
                    </div>
                  </div>
                  {showReviewGutter ? (
                    <aside
                      ref={reviewGutterAsideRef}
                      className={REVIEW_GUTTER_ASIDE_CLASS}
                      aria-label="Review margin"
                    >
                      <MarginGutter
                        onSectionOverflow={handleSectionOverflow}
                      />
                    </aside>
                  ) : null}
                </div>
                </ReviewGutterPaintedProvider>
                </CanvasTabPane>
                {analyticsOpen ? (
                  <CanvasTabPane
                    active={analyticsSurface}
                    testId="report-analytics-canvas"
                  >
                    <StatisticalWorkspace
                      reportId={report.id}
                      readOnly={!analyticsCanEdit}
                      reloadEpoch={analyticsReloadEpoch}
                      agentBusy={analyticsAgentBusy}
                      focusApiRef={analyticsFocusRef}
                      onMentionSheetsChange={handleAnalyticsMentionSheetsChange}
                    />
                  </CanvasTabPane>
                ) : null}
                <AttachmentCanvasStack
                  openAttachmentIds={liveOpenAttachmentIds}
                  activeAttachmentId={
                    viewingDocument
                      ? attachmentIdFromTab(liveActiveTabId)
                      : null
                  }
                  onCloseTab={closeAttachmentTab}
                />
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
    </CanvasTabScrollProvider>
  );
}
