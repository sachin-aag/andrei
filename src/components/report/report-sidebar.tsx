"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
import type { AnalyticsMentionSheet } from "@/lib/statistical-analysis/mentions";
import type { SectionType } from "@/db/schema";
import type { Placeholder } from "@/lib/placeholders/find";
import type { WorkProductView, WorkspaceChrome } from "./workspace-chrome";
import { getEvaluatableSections } from "@/lib/document-types";
import { COLLAPSED_RAIL_PX } from "./workspace-layout";

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
  onAnalyticsFocusSheet?: (sheetId: string) => void;
  onAnalyticsFocusAnalysis?: (analysisId: string) => void;
  analyticsReloadEpoch?: number;
  analyticsMentionSheets?: AnalyticsMentionSheet[];
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
  chrome = "agent",
  initialCriteriaSection,
  workProductView = "report",
  statsEnabled = false,
  onAnalyticsSettled,
  onAnalyticsAgentBusy,
  onAnalyticsFocusSheet,
  onAnalyticsFocusAnalysis,
  analyticsReloadEpoch,
  analyticsMentionSheets,
}: Props) {
  const analyticsSurface = workProductView === "analytics";
  const chatVisible =
    !collapsed && (analyticsSurface || activeTab === "assistant");
  const chatShellRef = useRef<HTMLDivElement>(null);
  const lastOpenChatWidthRef = useRef(360);
  const wasChatVisibleRef = useRef(chatVisible);
  const [holdChatPark, setHoldChatPark] = useState(false);
  useLayoutEffect(() => {
    if (!chatVisible) return;
    const width = chatShellRef.current?.offsetWidth ?? 0;
    if (width > COLLAPSED_RAIL_PX) {
      lastOpenChatWidthRef.current = width;
    }
  });
  useLayoutEffect(() => {
    const becameVisible = chatVisible && !wasChatVisibleRef.current;
    wasChatVisibleRef.current = chatVisible;
    if (!becameVisible) return;
    setHoldChatPark(true);
    const timeout = window.setTimeout(() => setHoldChatPark(false), 220);
    return () => window.clearTimeout(timeout);
  }, [chatVisible]);
  const parkChat = !chatVisible || holdChatPark;
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

  const tabBadge = (tab: SidebarTab): number | null => {
    if (tab === "placeholders" && pendingPlaceholders.length > 0) {
      return pendingPlaceholders.length;
    }
    if (tab === "criteria" && openSuggestionCount > 0) {
      return openSuggestionCount;
    }
    if (tab === "comments" && rootCommentCount > 0) {
      return rootCommentCount;
    }
    return null;
  };

  const activeTabDef =
    visibleTabs.find((tab) => tab.value === activeTab) ?? visibleTabs[0]!;
  const ActiveTabIcon = activeTabDef.icon;
  const activeTabBadge = tabBadge(activeTabDef.value);

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

      {/* Tab buttons — expanded shows all tabs; collapsed shows the active tab only */}
      {analyticsSurface ? null : collapsed ? (
        <div className="shrink-0 border-b border-[var(--border)] px-1 py-2">
          <button
            type="button"
            onClick={() => {
              onToggleCollapse();
              captureEvent("sidebar_tab_changed", { tab: activeTabDef.value });
            }}
            className="relative mx-auto flex size-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            title={activeTabDef.label}
            aria-label={activeTabDef.label}
            aria-pressed
          >
            <ActiveTabIcon className="size-4" aria-hidden="true" />
            {activeTabBadge != null ? (
              <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
                {activeTabBadge}
              </span>
            ) : null}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--border)] px-2 py-1.5">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const badge = tabBadge(tab.value);
            const selected = activeTab === tab.value;

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
          not reset. Hide with visibility (not display:none) so the scroller
          keeps its layout box and scrollTop through the width animation.
          Criteria / Placeholders / Comments share this flex-1 box; parked
          chat is position:absolute so it does not steal the top half. */}
      <div
        className={cn(
          "relative min-h-0 flex-1",
          parkChat && "overflow-hidden"
        )}
      >
        <div
          ref={chatShellRef}
          className={cn(
            "flex h-full min-h-0 w-full flex-col",
            parkChat && "absolute top-0 right-0",
            !chatVisible && "invisible pointer-events-none"
          )}
          style={
            parkChat ? { width: lastOpenChatWidthRef.current } : undefined
          }
          aria-hidden={!chatVisible}
        >
          <ChatPanel
            visible={chatVisible}
            workspaceChrome={chrome}
            statsEnabled={statsEnabled}
            onWorksheetChanged={() => onAnalyticsSettled?.()}
            onAgentBusyChange={onAnalyticsAgentBusy}
            onAnalyticsFocusSheet={onAnalyticsFocusSheet}
            onAnalyticsFocusAnalysis={onAnalyticsFocusAnalysis}
            analyticsReloadEpoch={analyticsReloadEpoch}
            mentionSheets={analyticsMentionSheets}
          />
        </div>
        {!collapsed && !analyticsSurface && activeTab !== "assistant" ? (
          <div
            className="h-full min-h-0 overflow-y-auto p-4 min-w-0"
            data-testid="sidebar-tab-panel"
          >
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
      </div>
    </aside>
  );
}
