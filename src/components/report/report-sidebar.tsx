"use client";

import { useRef, useState } from "react";
import {
  FileText,
  FileQuestion,
  ListChecks,
  Loader2,
  MessageSquare,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isAiSuggestionKind } from "@/lib/ai/suggestion-gating";
import { useReportPlaceholders, useReportComments } from "@/providers/report-provider";
import { useReportAttachments } from "@/providers/report-attachments-provider";
import { captureEvent } from "@/lib/analytics/events";
import { PlaceholdersPanelContent } from "./placeholders-panel";
import { CriteriaPanelContent, CommentsPanelContent } from "./criteria-sheet";
import { ChatPanel } from "./chat-panel";
import type { SectionType } from "@/db/schema";
import type { AttachmentProcessingStatus } from "@/db/schema";
import type { Placeholder } from "@/lib/placeholders/find";

export type SidebarTab =
  | "assistant"
  | "placeholders"
  | "criteria"
  | "comments"
  | "documents";

type Props = {
  collapsed: boolean;
  /** When true, sidebar is fixed to the right edge of the workspace and stacks above the review gutter. */
  overlaysWorkspace?: boolean;
  onToggleCollapse: () => void;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onJumpToSection: (section: SectionType) => void;
  onJumpToPlaceholder: (p: Placeholder) => void;
  onJumpToComment: (commentId: string) => void;
  initialCriteriaSection?: SectionType;
};

const TABS: { value: SidebarTab; label: string; icon: typeof ListChecks }[] = [
  { value: "assistant", label: "Assistant", icon: Sparkles },
  { value: "placeholders", label: "Placeholders", icon: FileQuestion },
  { value: "criteria", label: "Criteria", icon: ListChecks },
  { value: "comments", label: "Comments", icon: MessageSquare },
  { value: "documents", label: "Documents", icon: Paperclip },
];

export function ReportSidebar({
  collapsed,
  overlaysWorkspace = false,
  onToggleCollapse,
  activeTab,
  onTabChange,
  onJumpToSection,
  onJumpToPlaceholder,
  onJumpToComment,
  initialCriteriaSection,
}: Props) {
  const { pendingPlaceholders } = useReportPlaceholders();
  const { comments } = useReportComments();
  const { attachments } = useReportAttachments();
  const rootCommentCount = comments.filter((c) => !c.parentId).length;
  const openSuggestionCount = comments.filter(
    (c) => !c.parentId && isAiSuggestionKind(c.kind) && c.status === "open"
  ).length;

  return (
    <aside
      aria-label="Report sidebar"
      className={cn(
        "flex flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--card)] transition-[width,box-shadow] duration-200 ease-in-out",
        overlaysWorkspace && !collapsed
          ? "absolute inset-y-0 right-0 z-40 max-h-full shadow-2xl"
          : "relative shrink-0",
        collapsed ? "w-12" : "w-[400px]",
      )}
    >
      {/* Collapse toggle */}
      <div
        className={cn(
          "border-b border-[var(--border)] shrink-0",
          collapsed ? "px-1 py-2 flex justify-center" : "px-3 py-2",
        )}
      >
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
          className={cn(
            "flex items-center gap-2 rounded-md text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
            collapsed
              ? "size-9 justify-center"
              : "w-full px-2 py-1.5",
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelRightClose className="size-4" />
          ) : (
            <>
              <PanelRightOpen className="size-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* Tab buttons — icons only when collapsed; wrap when expanded so Documents stays reachable */}
      <div
        className={cn(
          "border-b border-[var(--border)] shrink-0",
          collapsed
            ? "px-1 py-2 space-y-1"
            : "flex flex-wrap items-center gap-1 px-2 py-1.5",
        )}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const badge =
            tab.value === "placeholders" && pendingPlaceholders.length > 0
              ? pendingPlaceholders.length
              : tab.value === "criteria" && openSuggestionCount > 0
                ? openSuggestionCount
              : tab.value === "comments" && rootCommentCount > 0
                ? rootCommentCount
              : tab.value === "documents" && attachments.length > 0
                ? attachments.length
                : null;

          if (collapsed) {
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  if (collapsed) onToggleCollapse();
                  captureEvent("sidebar_tab_changed", { tab: tab.value });
                  onTabChange(tab.value);
                }}
                className={cn(
                  "relative flex items-center justify-center size-9 rounded-md border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] mx-auto",
                  activeTab === tab.value
                    ? "bg-[var(--secondary)] text-[var(--foreground)] border-[var(--border)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/50 border-transparent hover:border-[var(--border)]",
                )}
                title={tab.label}
                aria-label={tab.label}
              >
                <Icon className="size-4" aria-hidden="true" />
                {badge != null && (
                  <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                captureEvent("sidebar_tab_changed", { tab: tab.value });
                onTabChange(tab.value);
              }}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                activeTab === tab.value
                  ? "bg-[var(--secondary)] text-[var(--foreground)] border-[var(--border)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/50 border-transparent hover:border-[var(--border)]",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {tab.label}
              {badge != null && (
                <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content — only when expanded. Assistant manages its own scroll/input
          layout, so it gets a full-height container without the shared padding. */}
      {!collapsed &&
        (activeTab === "assistant" ? (
          <div className="min-h-0 flex-1">
            <ChatPanel />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 min-w-0">
            {activeTab === "placeholders" && (
              <PlaceholdersPanelContent
                onJumpToPlaceholder={onJumpToPlaceholder}
              />
            )}
            {activeTab === "criteria" && (
              <CriteriaPanelContent
                onJumpToSection={onJumpToSection}
                initialSection={initialCriteriaSection}
              />
            )}
            {activeTab === "comments" && (
              <CommentsPanelContent onJumpToComment={onJumpToComment} />
            )}
            {activeTab === "documents" && <DocumentsPanelContent />}
          </div>
        ))}
    </aside>
  );
}

function DocumentsPanelContent() {
  const {
    attachments,
    uploadProgress,
    canMutateAttachments,
    activeAttachmentId,
    openDocument,
    uploadFiles,
    removeAttachment,
    retryAttachment,
  } = useReportAttachments();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      await uploadFiles(files);
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (id: string, filename: string) => {
    const confirmed = window.confirm(`Remove "${filename}" from this report?`);
    if (!confirmed) return;
    await removeAttachment(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            PDF documents
          </h3>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Upload source PDFs for report review and AI retrieval.
          </p>
        </div>
        {canMutateAttachments ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              Upload
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(event) => void handleFiles(event.target.files)}
            />
          </>
        ) : null}
      </div>

      {attachments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">
          No PDF documents have been attached yet.
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const progress =
              uploadProgress[attachment.id]?.percent ?? attachment.processingProgress;
            const isActive = activeAttachmentId === attachment.id;
            return (
              <div
                key={attachment.id}
                className={cn(
                  "rounded-lg border border-[var(--border)] bg-[var(--background)] p-3",
                  isActive && "border-[var(--brand-600)] ring-1 ring-[var(--brand-600)]"
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => openDocument(attachment.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                      <FileText className="size-4 shrink-0 text-[var(--muted-foreground)]" />
                      <span className="truncate">{attachment.filename}</span>
                    </span>
                    <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                      {formatBytes(attachment.sizeBytes)}
                      {attachment.pageCount ? ` · ${attachment.pageCount} pages` : ""}
                    </span>
                  </button>
                  {canMutateAttachments ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {attachment.processingStatus === "failed" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Retry ${attachment.filename}`}
                          onClick={() => void retryAttachment(attachment.id)}
                        >
                          <RotateCw className="size-3.5" aria-hidden="true" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                        aria-label={`Remove ${attachment.filename}`}
                        onClick={() =>
                          void handleRemove(attachment.id, attachment.filename)
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <AttachmentStatusBadge status={attachment.processingStatus} />
                  {isNonTerminalStatus(attachment.processingStatus) ? (
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {progress}%
                    </span>
                  ) : null}
                </div>
                {isNonTerminalStatus(attachment.processingStatus) ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--secondary)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand-600)] transition-[width]"
                      style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                    />
                  </div>
                ) : null}
                {attachment.processingError ? (
                  <p className="mt-2 text-xs text-[var(--destructive)]">
                    {attachment.processingError}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AttachmentStatusBadge({
  status,
}: {
  status: AttachmentProcessingStatus;
}) {
  switch (status) {
    case "ready":
      return <Badge variant="success">Ready</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "uploading":
      return <Badge variant="secondary">Uploading</Badge>;
    case "validating":
      return <Badge variant="secondary">Validating</Badge>;
    case "queued":
      return <Badge variant="warning">Queued</Badge>;
    case "processing":
      return <Badge variant="warning">Processing</Badge>;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function isNonTerminalStatus(status: AttachmentProcessingStatus): boolean {
  return (
    status === "uploading" ||
    status === "validating" ||
    status === "queued" ||
    status === "processing"
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
