"use client";

import {
  FileQuestion,
  ListChecks,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReportPlaceholders, useReportComments } from "@/providers/report-provider";
import { PlaceholdersPanelContent } from "./placeholders-panel";
import { CriteriaPanelContent, CommentsPanelContent } from "./criteria-sheet";
import type { SectionType } from "@/db/schema";
import type { Placeholder } from "@/lib/placeholders/find";

export type SidebarTab = "placeholders" | "criteria" | "comments";

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
  { value: "placeholders", label: "Placeholders", icon: FileQuestion },
  { value: "criteria", label: "Criteria", icon: ListChecks },
  { value: "comments", label: "Comments", icon: MessageSquare },
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
  const rootCommentCount = comments.filter((c) => !c.parentId).length;

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

      {/* Tab buttons — icons only when collapsed, full tabs when expanded */}
      <div
        className={cn(
          "border-b border-[var(--border)] shrink-0",
          collapsed ? "px-1 py-2 space-y-1" : "px-2 py-1.5 flex items-center gap-1",
        )}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const badge =
            tab.value === "placeholders" && pendingPlaceholders.length > 0
              ? pendingPlaceholders.length
              : tab.value === "comments" && rootCommentCount > 0
                ? rootCommentCount
                : null;

          if (collapsed) {
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  if (collapsed) onToggleCollapse();
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
              onClick={() => onTabChange(tab.value)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
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

      {/* Scrollable content — only when expanded */}
      {!collapsed && (
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
      )}
    </aside>
  );
}
