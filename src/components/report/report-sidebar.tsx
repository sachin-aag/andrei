"use client";

import {
  FileQuestion,
  ListChecks,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isAiSuggestionKind } from "@/lib/ai/suggestion-gating";
import { useReportPlaceholders, useReportComments, useReportData } from "@/providers/report-provider";
import { captureEvent } from "@/lib/analytics/events";
import { PlaceholdersPanelContent } from "./placeholders-panel";
import { CriteriaPanelContent, CommentsPanelContent } from "./criteria-sheet";
import { ChatPanel } from "./chat-panel";
import type { SectionType } from "@/db/schema";
import type { Placeholder } from "@/lib/placeholders/find";
import type { WorkProductView, WorkspaceChrome } from "./workspace-chrome";
import { getEvaluatableSections } from "@/lib/document-types";

export type SidebarTab =
  | "assistant"
  | "placeholders"
  | "criteria"
  | "comments";

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onJumpToSection: (section: SectionType) => void;
  onJumpToPlaceholder: (p: Placeholder) => void;
  onJumpToComment: (commentId: string) => void;
  hideCollapse?: boolean;
  chrome?: WorkspaceChrome;
  initialCriteriaSection?: SectionType;
  workProductView?: WorkProductView;
  statsEnabled?: boolean;
  onAnalyticsSettled?: () => void;
  onAnalyticsAgentBusy?: (busy: boolean) => void;
};

const TABS: { value: SidebarTab; label: string; icon: typeof ListChecks }[] = [
  { value: "assistant", label: "Assistant", icon: Sparkles },
  { value: "placeholders", label: "Placeholders", icon: FileQuestion },
  { value: "criteria", label: "Criteria", icon: ListChecks },
  { value: "comments", label: "Comments", icon: MessageSquare },
];

export function ReportSidebar({
  collapsed,
  onToggleCollapse,
  activeTab,
  onTabChange,
  onJumpToSection,
  onJumpToPlaceholder,
  onJumpToComment,
  hideCollapse = false,
  chrome = "document",
  initialCriteriaSection,
  workProductView = "report",
  statsEnabled = false,
  onAnalyticsSettled,
  onAnalyticsAgentBusy,
}: Props) {
  const analyticsSurface = workProductView === "analytics";
  const { pendingPlaceholders } = useReportPlaceholders();
  const { comments } = useReportComments();
  const { report } = useReportData();
  const showCriteria = getEvaluatableSections(report.documentType).length > 0;
  const visibleTabs = showCriteria
    ? TABS
    : TABS.filter((tab) => tab.value !== "criteria");
  const rootCommentCount = comments.filter((c) => !c.parentId).length;
  const openSuggestionCount = comments.filter(
    (c) => !c.parentId && isAiSuggestionKind(c.kind) && c.status === "open"
  ).length;

  return (
    <aside
      id="report-chat-sidebar"
      aria-label="Report sidebar"
      className={cn(
        "flex h-full w-full min-w-0 flex-col overflow-hidden bg-[var(--card)]",
        chrome === "agent"
          ? "border-x border-[var(--border)]"
          : "border-l border-[var(--border)]"
      )}
    >
      {hideCollapse ? null : (
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
      )}

      {/* Tab buttons — icons only when collapsed; wrap when expanded so none get clipped */}
      {analyticsSurface ? null : (
      <div
        className={cn(
          "border-b border-[var(--border)] shrink-0",
          collapsed
            ? "px-1 py-2 space-y-1"
            : "flex flex-wrap items-center gap-1 px-2 py-1.5",
        )}
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const badge =
            tab.value === "placeholders" && pendingPlaceholders.length > 0
              ? pendingPlaceholders.length
              : tab.value === "criteria" && openSuggestionCount > 0
                ? openSuggestionCount
              : tab.value === "comments" && rootCommentCount > 0
                ? rootCommentCount
                : null;

          const selected = activeTab === tab.value;

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
                  selected
                    ? "bg-[var(--secondary)] text-[var(--foreground)] border-[var(--border)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/50 border-transparent hover:border-[var(--border)]",
                )}
                title={tab.label}
                aria-label={tab.label}
                aria-pressed={selected}
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
                selected
                  ? "bg-[var(--secondary)] text-[var(--foreground)] border-[var(--border)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/50 border-transparent hover:border-[var(--border)]",
              )}
              aria-label={tab.label}
              aria-pressed={selected}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {tab.label}
              {tab.value !== "assistant" ? (
                // Keep a badge slot on count tabs so a late placeholder /
                // suggestion / comment count does not reflow flex-wrap.
                <span
                  aria-hidden="true"
                  className={cn(
                    "ml-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white",
                    badge == null && "invisible"
                  )}
                >
                  {badge ?? 0}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      )}

      {/* ChatPanel stays mounted across collapse, tab, and work-product
          changes so the thread, composer prefs, and rendered markdown are
          not reset. Hide with CSS instead of unmounting. Assistant manages
          its own scroll/input, so it gets a full-height container without
          the shared padding. */}
      <div
        className={cn(
          "min-h-0 flex-1",
          (collapsed || (!analyticsSurface && activeTab !== "assistant")) &&
            "hidden"
        )}
      >
        <ChatPanel
          workspaceChrome={chrome}
          workProductView={workProductView}
          statsEnabled={statsEnabled}
          onWorksheetChanged={() => onAnalyticsSettled?.()}
          onAgentBusyChange={onAnalyticsAgentBusy}
        />
      </div>
      {!collapsed && !analyticsSurface && activeTab !== "assistant" ? (
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
        </div>
      ) : null}
    </aside>
  );
}
